"""Service layer for leaderboards & streaks."""

from __future__ import annotations

import json
from collections import defaultdict
from datetime import date, datetime, timedelta, timezone
from typing import Dict, List, Optional, Sequence, Tuple
from uuid import UUID
import uuid

import asyncpg

from app.domain.leaderboards import outbox, policy
from app.domain.leaderboards.accrual import LeaderboardAccrual, cache_user_campus
from app.domain.leaderboards.models import (
	DailyCounters,
	LeaderboardPeriod,
	LeaderboardRow,
	LeaderboardScope,
	ScoreBreakdown,
	StreakState,
)
from app.domain.leaderboards.schemas import LeaderboardResponseSchema, LeaderboardRowSchema, MySummarySchema, StreakSummarySchema
from app.infra.postgres import get_pool
from app.infra.redis import redis_client
from app.domain.xp.service import XPService
from app.domain.xp.models import XPAction


def _today_ymd() -> int:
	now = datetime.now(timezone.utc)
	return now.year * 10000 + now.month * 100 + now.day


def _ymd_to_date(ymd: int) -> date:
	year = ymd // 10000
	month = (ymd % 10000) // 100
	day = ymd % 100
	return date(year, month, day)


def _date_to_ymd(value: date) -> int:
	return value.year * 10000 + value.month * 100 + value.day


def _scope_value(scores: ScoreBreakdown, scope: LeaderboardScope) -> float:
	if scope is LeaderboardScope.SOCIAL:
		return scores.social
	if scope is LeaderboardScope.ENGAGEMENT:
		return scores.engagement
	if scope is LeaderboardScope.POPULARITY:
		return scores.popularity
	return scores.overall


def _format_zset_key(scope: LeaderboardScope, period: LeaderboardPeriod, campus_id: str, ymd: int) -> str:
	return f"lb:z:{scope.value}:{period.value}:{campus_id}:{ymd}"


def _rank_rows(values: Sequence[Tuple[str, float]]) -> List[LeaderboardRow]:
	sorted_vals = sorted(values, key=lambda item: item[1], reverse=True)
	rows: List[LeaderboardRow] = []
	for idx, (user_id, score) in enumerate(sorted_vals, start=1):
		rows.append(LeaderboardRow(rank=idx, user_id=UUID(user_id), score=score))
	return rows


class LeaderboardService:
	"""Coordinates scoring, snapshots, and API results."""

	def __init__(self) -> None:
		self._redis = redis_client
		self._accrual = LeaderboardAccrual()

	def _score_for_user(self, counters: DailyCounters, streak_days: int) -> ScoreBreakdown:
		counters = policy.clamp_daily_counters(counters)
		
		# Social points: friends, meetups, messaging (NOT games)
		# These accumulate to determine Social Score LEVEL
		social = max(0.0, (
			policy.W_INVITE_ACCEPT * counters.invites_accepted
			+ policy.W_FRIEND_NEW * counters.friends_new
			+ policy.W_FRIEND_REMOVED * counters.friends_removed
			+ policy.W_DM_SENT * counters.dm_sent
			+ policy.W_ROOM_SENT * counters.room_sent
			+ policy.W_ROOM_JOIN * counters.rooms_joined
			+ policy.W_ROOM_CREATE * counters.rooms_created
		))
		
		# Game points: games played and won (separate from social)
		engagement = max(0.0, (
			policy.W_ACT_PLAYED * counters.acts_played
			+ policy.W_ACT_WON * counters.acts_won
		))
		
		# Popularity bonus
		popularity = max(0.0, (
			policy.W_POP_UNIQ_SENDER * counters.uniq_senders
			+ policy.W_POP_UNIQ_INVITE_FROM * counters.uniq_invite_accept_from
		))
		
		# Overall combines everything with streak multiplier
		overall_raw = max(0.0, social + engagement + popularity)
		multiplier = policy.streak_multiplier(streak_days)
		overall = max(0.0, overall_raw * multiplier)
		
		return ScoreBreakdown(
			social=social,
			engagement=engagement,
			popularity=popularity,
			overall_raw=overall_raw,
			streak_multiplier=multiplier,
			overall=overall,
		)

	# =========================================================================
	# ANTI-CHEAT AWARE RECORDING METHODS
	# =========================================================================

	async def record_activity_outcome(
		self,
		*,
		user_ids: List[str],
		winner_id: Optional[str] = None,
		game_kind: str = "tictactoe",
		campus_map: Optional[Dict[str, str]] = None,
		duration_seconds: int = 60,  # Default to 60s if not provided
		move_count: int = 10,        # Default to 10 moves if not provided
	) -> List[str]:
		"""
		Record game/activity outcome with anti-cheat validation.
		Returns list of user IDs that actually received points.
		"""
		import logging
		logger = logging.getLogger("unihood.leaderboards")
		# Cache campus mappings for users
		campus_map = campus_map or {}
		for uid in user_ids:
			cid = campus_map.get(uid)
			if cid:
				await cache_user_campus(uid, cid)

		logger.info(f"[record_activity_outcome] user_ids={user_ids} winner_id={winner_id} game_kind={game_kind} campus_map={campus_map} duration={duration_seconds}s moves={move_count}")
		# Delegate to accrual with anti-cheat checks
		awarded = await self._accrual.record_activity_ended(
			user_ids=user_ids,
			winner_id=winner_id,
			duration_seconds=duration_seconds,
			move_count=move_count,
		)
		logger.info(f"[record_activity_outcome] awarded={awarded}")

		# Persist lifetime counters to Postgres so they don't reset when Redis rolls over.
		# Important: even if anti-cheat blocks awarding points, we still record games played/wins.
		# Points only accrue for users in `awarded`.
		pool = await get_pool()
		awarded_set = set(awarded)
		async with pool.acquire() as conn:
			for uid in user_ids:
				try:
					user_uuid = UUID(uid)
				except Exception:
					logger.warning(f"Malformed user id: {uid}")
					continue
				win_inc = 1 if winner_id and uid == winner_id else 0
				points_inc = 0
				if uid in awarded_set:
					points_inc = int(policy.W_ACT_PLAYED) + (int(policy.W_ACT_WON) if win_inc else 0)
					
					# Award XP
					try:
						xp_svc = XPService()
						# GAME_PLAYED is already awarded at start in domain managers for immediate feedback
						if win_inc:
							await xp_svc.award_xp(user_uuid, XPAction.GAME_WON, metadata={"game": game_kind})
						else:
							# Award GAME_LOST for either a loss or a draw
							is_draw = (winner_id is None)
							meta = {"game": game_kind}
							if is_draw:
								meta["is_draw"] = True
							await xp_svc.award_xp(user_uuid, XPAction.GAME_LOST, metadata=meta)
					except Exception as e:
						logger.error(f"Failed to award XP for game: {e}")

				logger.info(f"[record_activity_outcome] DB write: user={uid} game={game_kind} played=1 win={win_inc} points={points_inc}")
				try:
					await conn.execute(
						"""
						INSERT INTO user_game_stats (user_id, activity_key, games_played, wins, points, last_played_at)
						VALUES ($1, $2, 1, $3, $4, NOW())
						ON CONFLICT (user_id, activity_key) DO UPDATE
						SET games_played = user_game_stats.games_played + 1,
							wins = user_game_stats.wins + EXCLUDED.wins,
							points = user_game_stats.points + EXCLUDED.points,
							last_played_at = NOW()
						""",
						user_uuid,
						game_kind,
						win_inc,
						points_inc,
					)
				except asyncpg.UndefinedTableError:
					# CRITICAL FIX: Do not suppress this error silently. Log it as error so we know if migrations ran.
					logger.error("user_game_stats table missing! Game stats NOT recorded.")
					# We re-raise or just let it log. For now, logging error is sufficient to diagnose without crashing request.
					pass
				except Exception as e:
					logger.error(f"Failed to insert user_game_stats: {e}")


		return awarded

	async def record_dm_sent(
		self,
		*,
		from_user_id: str,
		to_user_id: str,
	) -> bool:
		"""
		Record DM sent with anti-cheat validation.
		Returns True if points were awarded, False if blocked.
		"""
		return await self._accrual.record_dm_sent(
			from_user_id=from_user_id,
			to_user_id=to_user_id,
		)

	async def record_friendship_accepted(
		self,
		*,
		user_a: str,
		user_b: str,
	) -> bool:
		"""
		Record new friendship with anti-cheat validation.
		Returns True if points were awarded, False if blocked.
		"""
		return await self._accrual.record_friendship_accepted(
			user_a=user_a,
			user_b=user_b,
		)

	async def record_invite_accepted(
		self,
		*,
		from_user_id: str,
		to_user_id: str,
	) -> None:
		"""Record that an invite sent by from_user_id was accepted by to_user_id."""
		await self._accrual.record_invite_accepted(
			from_user_id=from_user_id,
			to_user_id=to_user_id,
		)

	async def record_friendship_removed(
		self,
		*,
		user_a: str,
		user_b: str,
	) -> None:
		"""Record friendship removal (deducts points)."""
		await self._accrual.record_friendship_removed(
			user_a=user_a,
			user_b=user_b,
		)

	async def record_room_created(
		self,
		*,
		user_id: str,
		room_id: str,
	) -> None:
		"""Record meetup/room creation for tracking."""
		await self._accrual.record_room_created(
			user_id=user_id,
			room_id=room_id,
		)

	async def record_room_cancelled(
		self,
		*,
		user_id: str,
		room_id: str,
	) -> None:
		"""Record meetup/room cancellation - may remove points."""
		await self._accrual.record_room_cancelled(
			user_id=user_id,
			room_id=room_id,
		)

	async def record_room_joined(
		self,
		*,
		user_id: str,
		room_id: str,
	) -> bool:
		"""
		Record when user joins a meetup/room.
		Points are awarded when user leaves (if they stayed long enough).
		Returns True if join was recorded, False if blocked.
		"""
		return await self._accrual.record_room_joined(
			user_id=user_id,
			room_id=room_id,
		)

	async def record_room_left(
		self,
		*,
		user_id: str,
		room_id: str,
		attendee_count: int = 0,
	) -> bool:
		"""
		Record when user leaves a meetup/room.
		Awards join points only if user stayed long enough and room had enough attendees.
		Returns True if points were awarded, False otherwise.
		"""
		return await self._accrual.record_room_left(
			user_id=user_id,
			room_id=room_id,
			attendee_count=attendee_count,
		)

	# =========================================================================

	async def _update_streak(
		self,
		conn: asyncpg.Connection,
		user_id: str,
		ymd: int,
		touched: int,
	) -> StreakState:
		row = await conn.fetchrow(
			"SELECT current, best, last_active_ymd FROM streaks WHERE user_id = $1",
			user_id,
		)
		if touched:
			prev_ymd = _date_to_ymd(_ymd_to_date(ymd) - timedelta(days=1))
			if row and row["last_active_ymd"] == prev_ymd:
				current = int(row["current"]) + 1
			else:
				current = 1
			best = max(int(row["best"]) if row else 0, current)
			await conn.execute(
				"""
				INSERT INTO streaks (user_id, current, best, last_active_ymd, updated_at)
				VALUES ($1,$2,$3,$4,NOW())
				ON CONFLICT (user_id)
				DO UPDATE
				SET current = EXCLUDED.current,
					best = EXCLUDED.best,
					last_active_ymd = EXCLUDED.last_active_ymd,
					updated_at = NOW()
				""",
				user_id,
				current,
				best,
				ymd,
			)
			return StreakState(user_id=UUID(user_id), current=current, best=best, last_active_ymd=ymd)
		if row:
			return StreakState(
				user_id=UUID(user_id),
				current=int(row["current"]),
				best=int(row["best"]),
				last_active_ymd=int(row["last_active_ymd"]),
			)
		return StreakState.empty(UUID(user_id))

	async def compute_daily_snapshot(self, *, ymd: Optional[int] = None) -> None:
		"""Recompute daily leaderboards for all campuses and persist."""

		if ymd is None:
			ymd = _today_ymd()
		day_str = f"{ymd:08d}"
		user_ids = await self._accrual.list_user_ids_for_day(day_str)
		if not user_ids:
			return

		pool = await get_pool()
		async with pool.acquire() as conn:
			rows = await conn.fetch(
				"SELECT id, campus_id FROM users WHERE id = ANY($1::uuid[]) AND deleted_at IS NULL",
				user_ids,
			)
			campus_map: Dict[str, Optional[str]] = {str(row["id"]): (str(row["campus_id"]) if row["campus_id"] else None) for row in rows}
			# Filter user_ids to only include users that exist in the database
			valid_user_ids = set(campus_map.keys())
			for uid, campus in campus_map.items():
				await cache_user_campus(uid, campus)

			campus_buckets: Dict[str, Dict[str, Tuple[DailyCounters, StreakState]]] = defaultdict(dict)
			for user_id in user_ids:
				# Skip users that don't exist in database (deleted or never existed)
				if user_id not in valid_user_ids:
					continue
				counters = await self._accrual.get_daily_counters(day=day_str, user_id=user_id)
				streak = await self._update_streak(conn, user_id, ymd, counters.touched)
				campus_id = campus_map.get(user_id)
				if not campus_id:
					continue
				campus_buckets[campus_id][user_id] = (counters, streak)

			for campus_id, bucket in campus_buckets.items():
				await self._persist_campus_snapshot(conn, campus_id, ymd, bucket)
				await self._build_rollups(conn, campus_id, ymd)

	async def _persist_campus_snapshot(
		self,
		conn: asyncpg.Connection,
		campus_id: str,
		ymd: int,
		bucket: Dict[str, Tuple[DailyCounters, StreakState]],
	) -> None:
		if not bucket:
			return
		score_map: Dict[str, ScoreBreakdown] = {
			user_id: self._score_for_user(counters, streak.current)
			for user_id, (counters, streak) in bucket.items()
		}

		for scope in LeaderboardScope:
			values = [(user_id, _scope_value(scores, scope)) for user_id, scores in score_map.items()]
			await self._write_zset(scope, LeaderboardPeriod.DAILY, campus_id, ymd, values)

		overall_rows = _rank_rows([(user_id, _scope_value(scores, LeaderboardScope.OVERALL)) for user_id, scores in score_map.items()])
		records = [
			(
				ymd,
				campus_id,
				str(row.user_id),
				score_map[str(row.user_id)].social,
				score_map[str(row.user_id)].engagement,
				score_map[str(row.user_id)].popularity,
				score_map[str(row.user_id)].overall,
				row.rank,
			)
			for row in overall_rows
		]
		await conn.executemany(
			"""
			INSERT INTO lb_daily (ymd, campus_id, user_id, social, engagement, popularity, overall, rank_overall)
			VALUES ($1::int, $2::uuid, $3::uuid, $4, $5, $6, $7, $8)
			ON CONFLICT (ymd, campus_id, user_id)
			DO UPDATE SET social = EXCLUDED.social,
				engagement = EXCLUDED.engagement,
				popularity = EXCLUDED.popularity,
				overall = EXCLUDED.overall,
				rank_overall = EXCLUDED.rank_overall,
				created_at = NOW()
			""",
			records,
		)
		await outbox.record_snapshot("overall", "daily", campus_id, ymd, len(overall_rows))
		await self._award_daily_badges(conn, campus_id, ymd, overall_rows, bucket)

	async def _write_zset(
		self,
		scope: LeaderboardScope,
		period: LeaderboardPeriod,
		campus_id: str,
		ymd: int,
		values: Sequence[Tuple[str, float]],
	) -> None:
		key = _format_zset_key(scope, period, campus_id, ymd)
		if not values:
			await self._redis.delete(key)
			return
		await self._redis.zadd(key, {user_id: score for user_id, score in values})
		if period is LeaderboardPeriod.DAILY:
			expire_seconds = 30 * 24 * 60 * 60
		elif period is LeaderboardPeriod.WEEKLY:
			expire_seconds = 12 * 7 * 24 * 60 * 60
		else:
			expire_seconds = 6 * 30 * 24 * 60 * 60
		await self._redis.expire(key, expire_seconds)

	async def _build_rollups(self, conn: asyncpg.Connection, campus_id: str, ymd: int) -> None:
		for period, window in (
			(LeaderboardPeriod.WEEKLY, 7),
			(LeaderboardPeriod.MONTHLY, 30),
		):
			await self._compute_rollup(conn, campus_id, ymd, period, window)

	async def _compute_rollup(
		self,
		conn: asyncpg.Connection,
		campus_id: str,
		ymd: int,
		period: LeaderboardPeriod,
		window_days: int,
	) -> None:
		end_date = _ymd_to_date(ymd)
		start_date = end_date - timedelta(days=window_days - 1)
		start_ymd = _date_to_ymd(start_date)
		rows = await conn.fetch(
			"""
			SELECT user_id,
				SUM(social) AS social,
				SUM(engagement) AS engagement,
				SUM(popularity) AS popularity,
				SUM(overall) AS overall
			FROM lb_daily
			WHERE campus_id = $1
				AND ymd BETWEEN $2 AND $3
			GROUP BY user_id
			""",
			campus_id,
			start_ymd,
			ymd,
		)
		overall_values = [(str(row["user_id"]), float(row["overall"])) for row in rows]
		await self._write_zset(LeaderboardScope.OVERALL, period, campus_id, ymd, overall_values)
		# Additional scopes use same sums per pillar
		for scope, column in (
			(LeaderboardScope.SOCIAL, "social"),
			(LeaderboardScope.ENGAGEMENT, "engagement"),
			(LeaderboardScope.POPULARITY, "popularity"),
		):
			values = [(str(row["user_id"]), float(row[column])) for row in rows]
			await self._write_zset(scope, period, campus_id, ymd, values)
		await outbox.record_snapshot("overall", period.value, campus_id, ymd, len(overall_values))
		if period is LeaderboardPeriod.WEEKLY:
			top_rows = _rank_rows([(str(row["user_id"]), float(row["overall"])) for row in rows])
			await self._award_weekly_badges(conn, campus_id, ymd, top_rows)

	async def _award_badge(
		self,
		conn: asyncpg.Connection,
		*,
		user_id: str,
		kind: str,
		earned_ymd: int,
		meta: Optional[dict] = None,
	) -> None:
		result = await conn.execute(
			"""
			INSERT INTO badges (id, user_id, kind, earned_ymd, meta)
			SELECT $1, $2::uuid, $3, $4, $5::jsonb
			WHERE NOT EXISTS (
				SELECT 1 FROM badges WHERE user_id = $2::uuid AND kind = $3 AND earned_ymd = $4
			)
			""",
			uuid.uuid4(),
			user_id,
			kind,
			earned_ymd,
			json.dumps(meta or {}),
		)
		if result and result.split()[-1] == "1":
			await outbox.record_badge_awarded(kind)

	async def _award_daily_badges(
		self,
		conn: asyncpg.Connection,
		campus_id: str,
		ymd: int,
		overall_rows: List[LeaderboardRow],
		bucket: Dict[str, Tuple[DailyCounters, StreakState]],
	) -> None:
		top10 = overall_rows[:10]
		for row in top10:
			await self._award_badge(conn, user_id=str(row.user_id), kind="daily_top10", earned_ymd=ymd)
		for user_id, (counters, streak) in bucket.items():
			if streak.current >= 30:
				await self._award_badge(conn, user_id=user_id, kind="streak_30", earned_ymd=ymd)
			peers = await self._distinct_peers_last_7d(user_id, ymd)
			if peers >= 15:
				await self._award_badge(
					conn,
					user_id=user_id,
					kind="social_butterfly",
					earned_ymd=ymd,
					meta={"distinct_peers_7d": peers},
				)

	async def _award_weekly_badges(
		self,
		conn: asyncpg.Connection,
		campus_id: str,
		ymd: int,
		rows: List[LeaderboardRow],
	) -> None:
		for row in rows[:10]:
			await self._award_badge(conn, user_id=str(row.user_id), kind="weekly_top10", earned_ymd=ymd)

	async def _distinct_peers_last_7d(self, user_id: str, ymd: int) -> int:
		peers: set[str] = set()
		current = _ymd_to_date(ymd)
		for delta in range(7):
			day = current - timedelta(days=delta)
			key = f"lb:day:{_date_to_ymd(day):08d}:uniq_senders:{user_id}"
			members = await self._redis.smembers(key)
			if members:
				peers.update(members)
		return len(peers)

	async def get_leaderboard(
		self,
		*,
		scope: LeaderboardScope,
		period: LeaderboardPeriod,
		campus_id: UUID,
		ymd: Optional[int] = None,
		limit: int = 100,
	) -> LeaderboardResponseSchema:
		if ymd is None:
			ymd = _today_ymd()
		
		# For SOCIAL scope, use cached results with 30-second TTL
		if scope == LeaderboardScope.SOCIAL:
			cache_key = f"lb:cache:social:{campus_id}:{limit}"
			cached = await self._redis.get(cache_key)
			if cached:
				import json
				items = [(item["user_id"], item["score"]) for item in json.loads(cached)]
			else:
				items = await self._calculate_live_social_scores(campus_id, limit)
				# Cache for 30 seconds to reduce DB load
				import json
				await self._redis.setex(
					cache_key, 
					30, 
					json.dumps([{"user_id": uid, "score": s} for uid, s in items])
				)
		else:
			key = _format_zset_key(scope, period, str(campus_id), ymd)
			items = await self._redis.zrevrange(key, 0, limit - 1, withscores=True)
			if not items and scope == LeaderboardScope.OVERALL:
				# Use live XP stats for OVERALL scope if Redis is empty (or always)
				# This ensures "Total XP" is accurate and available immediately
				items = await self._calculate_live_xp_scores(campus_id, limit)
			
			if not items:
				items = await self._fallback_query(scope, period, campus_id, ymd, limit)
		
		# Fetch display names for all users
		user_ids = [user_id for user_id, _ in items]
		user_info = await self._fetch_user_display_names(user_ids)
		
		rows = [
			LeaderboardRowSchema(
				rank=idx + 1, 
				user_id=UUID(user_id), 
				score=float(score),
				display_name=user_info.get(user_id, {}).get("display_name"),
				handle=user_info.get(user_id, {}).get("handle"),
				avatar_url=user_info.get(user_id, {}).get("avatar_url"),
			) 
			for idx, (user_id, score) in enumerate(items)
		]
		return LeaderboardResponseSchema(
			scope=scope,
			period=period,
			ymd=ymd,
			campus_id=campus_id,
			items=rows,
		)

	async def _calculate_live_xp_scores(self, campus_id: UUID, limit: int) -> List[Tuple[str, float]]:
		"""Calculate Total XP scores for all users in a campus from user_xp_stats."""
		import logging
		logger = logging.getLogger(__name__)
		
		try:
			pool = await get_pool()
			async with pool.acquire() as conn:
				rows = await conn.fetch(
					"""
					SELECT 
						uxs.user_id,
						uxs.total_xp
					FROM user_xp_stats uxs
					JOIN users u ON u.id = uxs.user_id
					WHERE u.campus_id = $1 AND u.deleted_at IS NULL
					ORDER BY uxs.total_xp DESC
					LIMIT $2
					""",
					campus_id,
					limit,
				)
				
				return [(str(row["user_id"]), float(row["total_xp"])) for row in rows]
		except Exception as e:
			logger.error(f"_calculate_live_xp_scores failed: {e}")
			return []
	async def _calculate_live_social_scores(self, campus_id: UUID, limit: int) -> List[Tuple[str, float]]:
		"""Calculate social scores for all users in a campus from database."""
		import logging
		logger = logging.getLogger(__name__)
		
		try:
			pool = await get_pool()
			async with pool.acquire() as conn:
				# Get all users in this campus with their social activity counts
				# Note: invite_acceptances table may not exist, so we skip it
				rows = await conn.fetch(
					"""
					SELECT 
						u.id as user_id,
						COALESCE(f.friend_count, 0) as friend_count,
						COALESCE(mh.hosted_count, 0) as hosted_count,
						COALESCE(mj.joined_count, 0) as joined_count
					FROM users u
					LEFT JOIN (
						SELECT user_id, COUNT(*) as friend_count 
						FROM friendships 
						WHERE status = 'accepted' 
						GROUP BY user_id
					) f ON f.user_id = u.id
					LEFT JOIN (
						SELECT creator_user_id, COUNT(*) as hosted_count 
						FROM meetups 
						GROUP BY creator_user_id
					) mh ON mh.creator_user_id = u.id
					LEFT JOIN (
						SELECT user_id, COUNT(*) as joined_count 
						FROM meetup_participants 
						WHERE status = 'JOINED' 
						GROUP BY user_id
					) mj ON mj.user_id = u.id
					WHERE u.campus_id = $1 AND u.deleted_at IS NULL
					ORDER BY (
						COALESCE(f.friend_count, 0) * 50 + 
						COALESCE(mh.hosted_count, 0) * 100 + 
						COALESCE(mj.joined_count, 0) * 30
					) DESC
					LIMIT $2
					""",
					campus_id,
					limit,
				)
				
				logger.info(
					"_calculate_live_social_scores: campus_id=%s limit=%s found=%s users",
					campus_id, limit, len(rows)
				)
				
				results = []
				for row in rows:
					# Calculate total points
					total_points = (
						row["friend_count"] * policy.W_FRIEND_NEW +
						row["hosted_count"] * policy.W_ROOM_CREATE +
						row["joined_count"] * policy.W_ROOM_JOIN
					)
					# Convert to Social Score level
					social_score = policy.calculate_social_score_level(total_points)
					results.append((str(row["user_id"]), float(social_score)))
				
				logger.info(
					"_calculate_live_social_scores: returning %s results, top scores: %s",
					len(results),
					results[:5] if results else []
				)
				
				return results
		except Exception as e:
			logger.error(f"_calculate_live_social_scores failed: {e}")
			return []

	async def _fetch_user_display_names(self, user_ids: List[str]) -> Dict[str, Dict[str, str]]:
		"""Fetch display names and handles for a list of user IDs."""
		if not user_ids:
			return {}
		pool = await get_pool()
		async with pool.acquire() as conn:
			rows = await conn.fetch(
				"""
				SELECT id, display_name, handle, avatar_url
				FROM users
				WHERE id = ANY($1::uuid[]) AND deleted_at IS NULL
				""",
				[uuid.UUID(uid) for uid in user_ids],
			)
		return {
			str(row["id"]): {
				"display_name": row.get("display_name") or row.get("handle", ""),
				"handle": row.get("handle", ""),
				"avatar_url": row.get("avatar_url"),
			}
			for row in rows
		}

	async def _fallback_query(
		self,
		scope: LeaderboardScope,
		period: LeaderboardPeriod,
		campus_id: UUID,
		ymd: int,
		limit: int,
	) -> List[Tuple[str, float]]:
		pool = await get_pool()
		column = scope.value
		async with pool.acquire() as conn:
			if period is LeaderboardPeriod.DAILY:
				rows = await conn.fetch(
					f"""
					SELECT user_id, {column} AS score
					FROM lb_daily
					WHERE campus_id = $1 AND ymd = $2
					ORDER BY {column} DESC
					LIMIT $3
					""",
					campus_id,
					ymd,
					limit,
				)
			else:
				window = 7 if period is LeaderboardPeriod.WEEKLY else 30
				start = _date_to_ymd(_ymd_to_date(ymd) - timedelta(days=window - 1))
				rows = await conn.fetch(
					f"""
					SELECT user_id, SUM({column}) AS score
					FROM lb_daily
					WHERE campus_id = $1 AND ymd BETWEEN $2 AND $3
					GROUP BY user_id
					ORDER BY score DESC
					LIMIT $4
					""",
					campus_id,
					start,
					ymd,
					limit,
				)
		return [(str(row["user_id"]), float(row["score"])) for row in rows]

	async def get_my_summary(
		self,
		*,
		user_id: UUID,
		campus_id: Optional[UUID] = None,
		ymd: Optional[int] = None,
	) -> MySummarySchema:
		if ymd is None:
			ymd = _today_ymd()
		if campus_id is None:
			campus = await self._accrual.fetch_user_campus(str(user_id))
			if not campus:
				raise ValueError("Campus not found for user")
			campus_id = UUID(campus)

		redis_rows = {}
		for scope in LeaderboardScope:
			key = _format_zset_key(scope, LeaderboardPeriod.DAILY, str(campus_id), ymd)
			score = await self._redis.zscore(key, str(user_id))
			rank = await self._redis.zrevrank(key, str(user_id))
			if score is not None and rank is not None:
				redis_rows[scope.value] = (rank + 1, float(score))

		pool = await get_pool()
		if len(redis_rows) != len(list(LeaderboardScope)):
			async with pool.acquire() as conn:
				row = await conn.fetchrow(
					"SELECT social, engagement, popularity, overall FROM lb_daily WHERE campus_id = $1 AND ymd = $2 AND user_id = $3",
					campus_id,
					ymd,
					user_id,
				)
				if row:
					redis_rows.setdefault("social", (None, float(row["social"])) if redis_rows.get("social") is None else redis_rows["social"])
					redis_rows.setdefault("engagement", (None, float(row["engagement"])) if redis_rows.get("engagement") is None else redis_rows["engagement"])
					redis_rows.setdefault("popularity", (None, float(row["popularity"])) if redis_rows.get("popularity") is None else redis_rows["popularity"])
					redis_rows.setdefault("overall", (None, float(row["overall"])) if redis_rows.get("overall") is None else redis_rows["overall"])

		ranks = {}
		scores = {}
		for scope in LeaderboardScope:
			entry = redis_rows.get(scope.value)
			ranks[scope.value] = entry[0] if entry else None
			scores[scope.value] = entry[1] if entry else None

		async with pool.acquire() as conn:
			streak_row = await conn.fetchrow("SELECT current, best, last_active_ymd FROM streaks WHERE user_id = $1", user_id)
			badges = await conn.fetch(
				"SELECT kind, earned_ymd, meta FROM badges WHERE user_id = $1 ORDER BY earned_ymd DESC LIMIT 50",
				user_id,
			)

		# Default streak from DB
		current_streak = int(streak_row["current"]) if streak_row else 0
		best_streak = int(streak_row["best"]) if streak_row else 0
		last_active = int(streak_row["last_active_ymd"]) if streak_row else 0

		# Lifetime game stats live in Postgres (Redis-only counters roll over and would reset the UI).
		counts_map = {
			"games_played": 0,
			"wins": 0,
		}
		counters = None
		async with pool.acquire() as conn:
			try:
				row = await conn.fetchrow(
					"""
					SELECT
						COALESCE(SUM(games_played), 0) AS games_played,
						COALESCE(SUM(wins), 0) AS wins
					FROM user_game_stats
					WHERE user_id = $1
					""",
					user_id,
				)
			except asyncpg.UndefinedTableError:
				row = None
			if row:
				counts_map["games_played"] = int(row["games_played"])
				counts_map["wins"] = int(row["wins"])

		# If querying today, overlay live data from Redis counters for score projections (not for lifetime counts).
		if ymd == _today_ymd():
			day_str = f"{ymd:08d}"
			counters = await self._accrual.get_daily_counters(day=day_str, user_id=str(user_id))

			# Calculate projected streak if there's activity today
			if counters.touched:
				prev_ymd = _date_to_ymd(_ymd_to_date(ymd) - timedelta(days=1))
				if last_active == prev_ymd:
					# Continued streak from yesterday
					current_streak += 1
					last_active = ymd
				elif last_active == ymd:
					# Already updated in DB (snapshot ran)
					pass
				else:
					# Broken streak or new
					current_streak = 1
					last_active = ymd
				
				best_streak = max(best_streak, current_streak)

			# Calculate projected score
			live_score = self._score_for_user(counters, current_streak)
			
			# Overlay scores with live data
			scores["social"] = live_score.social
			scores["engagement"] = live_score.engagement
			scores["popularity"] = live_score.popularity
			scores["overall"] = live_score.overall

		# NEW: Calculate Social Score as a LEVEL based on accumulated points
		# Social points come from: friends, meetups hosted, meetups joined, messaging
		async with pool.acquire() as conn:
			# Count total friends (each friend = W_FRIEND_NEW points)
			friend_count_row = await conn.fetchrow(
				"SELECT COUNT(*) as count FROM friendships WHERE user_id = $1 AND status = 'accepted'",
				user_id
			)
			# Count meetups hosted (each = W_ROOM_CREATE points)
			hosted_count_row = await conn.fetchrow(
				"SELECT COUNT(*) as count FROM meetups WHERE creator_user_id = $1",
				user_id
			)
			# Count meetups joined (each = W_ROOM_JOIN points)
			joined_count_row = await conn.fetchrow(
				"SELECT COUNT(*) as count FROM meetup_participants WHERE user_id = $1 AND status = 'JOINED'",
				user_id
			)

			# Count invites sent (W_INVITE_SENT)
			invites_sent_row = await conn.fetchrow(
				"SELECT COUNT(*) as count FROM invitations WHERE from_user_id = $1",
				user_id
			)

			# Count swipes (W_DISCOVERY_SWIPE) - table may not exist
			try:
				swipes_row = await conn.fetchrow(
					"SELECT COUNT(*) as count FROM discovery_interactions WHERE user_id = $1",
					user_id
				)
			except Exception:
				swipes_row = None

			# Count matches (W_DISCOVERY_MATCH) - table may not exist
			try:
				matches_row = await conn.fetchrow(
					"SELECT COUNT(*) as count FROM discovery_matches WHERE user_a = $1 OR user_b = $1",
					user_id
				)
			except Exception:
				matches_row = None
			
			f_count = friend_count_row["count"] if friend_count_row else 0
			hosted_count = hosted_count_row["count"] if hosted_count_row else 0
			joined_count = joined_count_row["count"] if joined_count_row else 0
			invites_sent = invites_sent_row["count"] if invites_sent_row else 0
			swipes_count = swipes_row["count"] if swipes_row else 0
			matches_count = matches_row["count"] if matches_row else 0
			
			# Calculate total social points
			# Friends: 50 points each
			# Meetups hosted: 100 points each
			# Meetups joined: 30 points each
			# Invites sent: 10 points each
			# Swipes: 2 points each
			# Matches: 15 points each
			# Plus any daily messaging points from Redis counters
			total_social_points = (
				f_count * policy.W_FRIEND_NEW +
				hosted_count * policy.W_ROOM_CREATE +
				joined_count * policy.W_ROOM_JOIN +
				invites_sent * policy.W_INVITE_SENT +
				swipes_count * policy.W_DISCOVERY_SWIPE +
				matches_count * policy.W_DISCOVERY_MATCH
			)
			
			# Add daily activity points (DMs, room messages) if we have them
			if counters:
				total_social_points += counters.dm_sent * policy.W_DM_SENT
				total_social_points += counters.room_sent * policy.W_ROOM_SENT
				total_social_points += counters.invites_accepted * policy.W_INVITE_ACCEPT
			
			# Convert total points to Social Score LEVEL
			social_score_level = policy.calculate_social_score_level(total_social_points)
			
			# Store both the level (for display) and raw points (for context)
			scores["social"] = float(social_score_level)
			
			# Also add raw points to counts for frontend display
			counts_map["social_points"] = int(total_social_points)
			counts_map["friends"] = f_count
			counts_map["meetups_hosted"] = hosted_count
			counts_map["meetups_joined"] = joined_count
			
			# Calculate points needed for next level
			next_level, points_needed = policy.points_to_next_level(total_social_points)
			counts_map["next_level"] = next_level
			counts_map["points_to_next_level"] = int(points_needed)

		# Fetch actual XP stats for syncing
		try:
			xp_svc = XPService()
			xp_stats = await xp_svc.get_user_stats(user_id)
			user_xp = xp_stats.total_xp
			user_level = xp_stats.current_level
			user_level_label = xp_stats.level_label
			# Next level XP threshold
			user_next_xp = xp_stats.next_level_xp
		except Exception:
			user_xp = 0
			user_level = 1
			user_level_label = "Newcomer"
			user_next_xp = None

		# If the user wants the "Social Explorer" level on the home page 
		# to match their Reputation level, we should use user_level here.
		scores["social"] = float(user_level)

		streak = StreakSummarySchema(
			current=current_streak,
			best=best_streak,
			last_active_ymd=last_active,
		)
		badge_payload = []
		for row in badges:
			meta_raw = row["meta"]
			# Parse meta if it's a string (from JSON storage)
			if isinstance(meta_raw, str):
				try:
					meta = json.loads(meta_raw) if meta_raw else {}
				except (json.JSONDecodeError, TypeError):
					meta = {}
			else:
				meta = meta_raw or {}
			badge_payload.append({
				"kind": row["kind"],
				"earned_ymd": int(row["earned_ymd"]),
				"meta": meta
			})

		return MySummarySchema(
			ymd=ymd,
			campus_id=campus_id,
			ranks=ranks,
			scores=scores,
			counts=counts_map,
			streak=streak,
			badges=badge_payload,
			xp=user_xp,
			level=user_level,
			level_label=user_level_label,
			next_level_xp=user_next_xp,
		)

	async def get_streak_summary(self, user_id: UUID) -> StreakSummarySchema:
		pool = await get_pool()
		async with pool.acquire() as conn:
			row = await conn.fetchrow(
				"SELECT current, best, last_active_ymd FROM streaks WHERE user_id = $1",
				user_id,
			)
		if row:
			return StreakSummarySchema(
				current=int(row["current"]),
				best=int(row["best"]),
				last_active_ymd=int(row["last_active_ymd"]),
			)
		return StreakSummarySchema()
