"""Service layer for leaderboards & streaks."""

from __future__ import annotations

from collections import defaultdict
from datetime import date, datetime, timedelta, timezone
from typing import Dict, Iterable, List, Optional, Sequence, Tuple
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
		social = (
			policy.W_INVITE_ACCEPT * counters.invites_accepted
			+ policy.W_FRIEND_NEW * counters.friends_new
			+ policy.W_DM_SENT * counters.dm_sent
			+ policy.W_ROOM_SENT * counters.room_sent
		)
		engagement = (
			policy.W_ACT_PLAYED * counters.acts_played
			+ policy.W_ACT_WON * counters.acts_won
			+ policy.W_ROOM_JOIN * counters.rooms_joined
			+ policy.W_ROOM_CREATE * counters.rooms_created
		)
		popularity = (
			policy.W_POP_UNIQ_SENDER * counters.uniq_senders
			+ policy.W_POP_UNIQ_INVITE_FROM * counters.uniq_invite_accept_from
		)
		overall_raw = social + engagement + popularity
		multiplier = policy.streak_multiplier(streak_days)
		overall = overall_raw * multiplier
		return ScoreBreakdown(
			social=social,
			engagement=engagement,
			popularity=popularity,
			overall_raw=overall_raw,
			streak_multiplier=multiplier,
			overall=overall,
		)

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
				"SELECT id, campus_id FROM users WHERE id = ANY($1::uuid[])",
				user_ids,
			)
			campus_map: Dict[str, Optional[str]] = {str(row["id"]): (str(row["campus_id"]) if row["campus_id"] else None) for row in rows}
			for uid, campus in campus_map.items():
				await cache_user_campus(uid, campus)

			campus_buckets: Dict[str, Dict[str, Tuple[DailyCounters, StreakState]]] = defaultdict(dict)
			for user_id in user_ids:
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
			meta or {},
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
		key = _format_zset_key(scope, period, str(campus_id), ymd)
		items = await self._redis.zrevrange(key, 0, limit - 1, withscores=True)
		if not items:
			items = await self._fallback_query(scope, period, campus_id, ymd, limit)
		rows = [LeaderboardRowSchema(rank=idx + 1, user_id=UUID(user_id), score=float(score)) for idx, (user_id, score) in enumerate(items)]
		return LeaderboardResponseSchema(
			scope=scope,
			period=period,
			ymd=ymd,
			campus_id=campus_id,
			items=rows,
		)

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

		streak = StreakSummarySchema(
			current=int(streak_row["current"]) if streak_row else 0,
			best=int(streak_row["best"]) if streak_row else 0,
			last_active_ymd=int(streak_row["last_active_ymd"]) if streak_row else 0,
		)
		badge_payload = [
			{"kind": row["kind"], "earned_ymd": int(row["earned_ymd"]), "meta": row["meta"] or {}}
			for row in badges
		]

		return MySummarySchema(
			ymd=ymd,
			campus_id=campus_id,
			ranks=ranks,
			scores=scores,
			streak=streak,
			badges=badge_payload,
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
