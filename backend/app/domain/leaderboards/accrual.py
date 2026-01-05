"""Redis accrual utilities for leaderboards streams."""

from __future__ import annotations

from datetime import datetime, timezone
from typing import Iterable, List, Optional

import asyncpg

from app.domain.leaderboards import policy
from app.domain.leaderboards.models import DailyCounters
from app.infra.postgres import get_pool
from app.infra.redis import redis_client

DAY_TTL_SECONDS = 48 * 60 * 60
SET_TTL_SECONDS = DAY_TTL_SECONDS
STREAK_CACHE_TTL = 72 * 60 * 60
CAMPUS_CACHE_TTL = 24 * 60 * 60


def _now() -> datetime:
	return datetime.now(timezone.utc)


def _day_stamp(when: Optional[datetime] = None) -> str:
	when = when or _now()
	return when.strftime("%Y%m%d")


def _hash_key(day: str, user_id: str) -> str:
	return f"lb:day:{day}:user:{user_id}"


def _uniq_sender_key(day: str, user_id: str) -> str:
	return f"lb:day:{day}:uniq_senders:{user_id}"


def _uniq_accept_key(day: str, user_id: str) -> str:
	return f"lb:day:{day}:uniq_accept_from:{user_id}"


async def _ensure_campus_cache(conn: asyncpg.Connection, user_id: str) -> Optional[str]:
	cache_key = f"user:campus:{user_id}"
	cached = await redis_client.get(cache_key)
	if cached:
		return cached
	row = await conn.fetchrow("SELECT campus_id FROM users WHERE id = $1", user_id)
	if not row or not row["campus_id"]:
		return None
	campus_id = str(row["campus_id"])
	await redis_client.setex(cache_key, CAMPUS_CACHE_TTL, campus_id)
	return campus_id


async def cache_user_campus(user_id: str, campus_id: Optional[str]) -> None:
	"""Cache a user's campus id for leaderboard bucketing."""

	if campus_id is None:
		return
	await redis_client.setex(f"user:campus:{user_id}", CAMPUS_CACHE_TTL, campus_id)


class LeaderboardAccrual:
	"""Accumulates per-stream events into Redis counters."""

	def __init__(self) -> None:
		self._redis = redis_client

	async def _touch(self, user_id: str, *, day: str) -> None:
		key = _hash_key(day, user_id)
		await self._redis.hset(key, mapping={"touched": 1})
		await self._redis.expire(key, DAY_TTL_SECONDS)

	async def _hincr(self, key: str, field: str, amount: int) -> None:
		await self._redis.hincrby(key, field, amount)
		await self._redis.expire(key, DAY_TTL_SECONDS)

	async def _hincr_float(self, key: str, field: str, amount: float) -> None:
		await self._redis.hincrbyfloat(key, field, amount)
		await self._redis.expire(key, DAY_TTL_SECONDS)

	async def _sadd(self, key: str, member: str) -> None:
		await self._redis.sadd(key, member)
		await self._redis.expire(key, SET_TTL_SECONDS)

	async def record_invite_accepted(self, *, from_user_id: str, to_user_id: str, when: Optional[datetime] = None) -> None:
		day = _day_stamp(when)
		hash_key = _hash_key(day, from_user_id)
		await self._hincr(hash_key, "invites_accepted", 1)
		await self._touch(from_user_id, day=day)
		await self._touch(to_user_id, day=day)
		await self._sadd(_uniq_accept_key(day, to_user_id), from_user_id)

	async def record_friendship_accepted(self, *, user_a: str, user_b: str, when: Optional[datetime] = None) -> bool:
		"""
		Record new friendship for both users.
		Returns True if points were awarded, False if blocked by anti-cheat.
		"""
		day = _day_stamp(when)
		
		# Check daily friend limits for both users
		a_allowed = await policy.check_daily_friend_limit(user_a, day)
		b_allowed = await policy.check_daily_friend_limit(user_b, day)
		
		if not a_allowed and not b_allowed:
			# Both at limit, just touch for activity tracking
			await self._touch(user_a, day=day)
			await self._touch(user_b, day=day)
			return False
		
		# Award points only to those under limit
		if a_allowed:
			await self._hincr(_hash_key(day, user_a), "friends_new", 1)
			await policy.increment_daily_friend_count(user_a, day)
		if b_allowed:
			await self._hincr(_hash_key(day, user_b), "friends_new", 1)
			await policy.increment_daily_friend_count(user_b, day)
		
		await self._touch(user_a, day=day)
		await self._touch(user_b, day=day)
		return True

	async def record_friendship_removed(self, *, user_a: str, user_b: str, when: Optional[datetime] = None) -> None:
		"""Record friendship removal for scoring deduction."""
		day = _day_stamp(when)
		await self._hincr(_hash_key(day, user_a), "friends_removed", 1)
		await self._hincr(_hash_key(day, user_b), "friends_removed", 1)
		await self._touch(user_a, day=day)
		await self._touch(user_b, day=day)

	async def record_dm_sent(self, *, from_user_id: str, to_user_id: str, when: Optional[datetime] = None) -> bool:
		"""
		Record DM sent for scoring.
		Returns True if points were awarded, False if blocked by anti-cheat.
		"""
		when = when or _now()
		day = _day_stamp(when)
		
		# Check burst rate limiting
		if await policy.register_burst_and_mute(from_user_id, "dm", now=when):
			return False
		
		# Check per-recipient daily limit
		if not await policy.check_dm_recipient_limit(from_user_id, to_user_id, day):
			await self._touch(from_user_id, day=day)
			return False
		
		# Check cooldown between DMs to same person
		if not await policy.check_dm_recipient_cooldown(from_user_id, to_user_id):
			await self._touch(from_user_id, day=day)
			return False
		
		# All checks passed - award points
		await self._hincr_float(_hash_key(day, from_user_id), "dm_sent", 1.0)
		await self._sadd(_uniq_sender_key(day, to_user_id), from_user_id)
		await self._touch(from_user_id, day=day)
		await self._touch(to_user_id, day=day)
		
		# Update tracking
		await policy.increment_dm_recipient_count(from_user_id, to_user_id, day)
		await policy.set_dm_recipient_cooldown(from_user_id, to_user_id)
		
		return True

	async def record_room_message(self, *, user_id: str, when: Optional[datetime] = None) -> None:
		day = _day_stamp(when)
		if await policy.register_burst_and_mute(user_id, "room_chat", now=when or _now()):
			return
		await self._hincr_float(_hash_key(day, user_id), "room_sent", 1.0)
		await self._touch(user_id, day=day)

	async def record_room_created(self, *, user_id: str, room_id: Optional[str] = None, when: Optional[datetime] = None) -> None:
		"""
		Record meetup/room creation.
		Points are provisional - they only finalize if meetup completes successfully.
		"""
		when = when or _now()
		day = _day_stamp(when)
		
		# Record creation for cancel tracking
		if room_id:
			await policy.record_meetup_creation(user_id, room_id, now=when)
		
		await self._hincr(_hash_key(day, user_id), "rooms_created", 1)
		await self._touch(user_id, day=day)

	async def record_room_cancelled(self, *, user_id: str, room_id: str, when: Optional[datetime] = None) -> None:
		"""
		Record meetup/room cancellation - removes creation points if cancelled too quickly.
		"""
		when = when or _now()
		day = _day_stamp(when)
		
		# Check if cancelled within penalty window
		if await policy.check_meetup_cancel_penalty(room_id, now=when):
			# Remove the creation point (decrement)
			await self._hincr(_hash_key(day, user_id), "rooms_created", -1)

	async def record_room_joined(self, *, user_id: str, room_id: Optional[str] = None, when: Optional[datetime] = None) -> bool:
		"""
		Record when user joins a meetup/room.
		Points are NOT awarded immediately - awarded when user leaves after staying long enough.
		Returns True if join was recorded, False if blocked by cooldown.
		"""
		when = when or _now()
		day = _day_stamp(when)
		
		# Check if user has suspicious join-leave pattern
		if room_id and await policy.is_suspicious_join_leave(user_id, room_id, day):
			await self._touch(user_id, day=day)
			return False
		
		# Check cooldown for rejoining same room
		if room_id and not await policy.check_meetup_join_cooldown(user_id, room_id):
			await self._touch(user_id, day=day)
			return False
		
		# Record join time for duration tracking (points awarded on leave)
		if room_id:
			await policy.record_meetup_join_time(user_id, room_id, now=when)
			await policy.set_meetup_join_cooldown(user_id, room_id)
		
		await self._touch(user_id, day=day)
		return True

	async def record_room_left(
		self,
		*,
		user_id: str,
		room_id: str,
		attendee_count: int = 0,
		when: Optional[datetime] = None,
	) -> bool:
		"""
		Record when user leaves a meetup/room.
		Awards join points ONLY if:
		- User stayed long enough (MEETUP_STAY_DURATION_MINUTES)
		- Room has minimum attendees (MEETUP_MIN_ATTENDEES)
		Returns True if points were awarded, False otherwise.
		"""
		when = when or _now()
		day = _day_stamp(when)
		
		# Check minimum attendees
		if attendee_count < policy.MEETUP_MIN_ATTENDEES:
			await policy.track_rapid_join_leave(user_id, room_id, day)
			return False
		
		# Check if stayed long enough
		if not await policy.check_meetup_stay_duration(user_id, room_id, now=when):
			await policy.track_rapid_join_leave(user_id, room_id, day)
			return False
		
		# All checks passed - award join points
		await self._hincr(_hash_key(day, user_id), "rooms_joined", 1)
		await self._touch(user_id, day=day)
		return True

	async def record_activity_ended(
		self,
		*,
		user_ids: Iterable[str],
		winner_id: Optional[str] = None,
		duration_seconds: int = 0,
		move_count: int = 0,
		when: Optional[datetime] = None,
	) -> List[str]:
		"""
		Record game/activity completion with anti-cheat validation.
		Returns list of user IDs that received points.
		"""
		when = when or _now()
		day = _day_stamp(when)
		user_list = list(user_ids)
		awarded_users: List[str] = []
		
		import logging
		logger = logging.getLogger("unihood.leaderboards")
		logger.info(f"[record_activity_ended] user_ids={user_ids} winner_id={winner_id} duration={duration_seconds}s moves={move_count}")
		# Validate game duration
		if not policy.validate_game_duration(duration_seconds):
			logger.info(f"[record_activity_ended] Game too short: duration={duration_seconds}s. No points awarded.")
			for uid in user_list:
				await self._touch(uid, day=day)
			return awarded_users
		# Validate game had enough moves/actions
		if not policy.validate_game_moves(move_count):
			logger.info(f"[record_activity_ended] Not enough moves: moves={move_count}. No points awarded.")
			for uid in user_list:
				await self._touch(uid, day=day)
			return awarded_users
		# For 2-player games, check per-opponent limits
		if len(user_list) == 2:
			user_a, user_b = user_list[0], user_list[1]
			# Check daily opponent limit
			if not await policy.check_game_opponent_limit(user_a, user_b, day):
				logger.info(f"[record_activity_ended] Daily opponent limit reached for {user_a} vs {user_b} on {day}. No points awarded.")
				for uid in user_list:
					await self._touch(uid, day=day)
				return awarded_users
			# Check cooldown between games
			if not await policy.check_game_opponent_cooldown(user_a, user_b):
				logger.info(f"[record_activity_ended] Cooldown not met for {user_a} vs {user_b}. No points awarded.")
				for uid in user_list:
					await self._touch(uid, day=day)
				return awarded_users
			# Update opponent tracking
			await policy.increment_game_opponent_count(user_a, user_b, day)
			await policy.set_game_opponent_cooldown(user_a, user_b)
		# Award points to all participants
		for uid in user_list:
			logger.info(f"[record_activity_ended] Awarding points to {uid}")
			await self._hincr(_hash_key(day, uid), "acts_played", 1)
			await self._touch(uid, day=day)
			awarded_users.append(uid)
		# Award win bonus
		if winner_id and winner_id in user_list:
			logger.info(f"[record_activity_ended] Awarding win bonus to {winner_id}")
			await self._hincr(_hash_key(day, winner_id), "acts_won", 1)
		return awarded_users

	async def mark_presence_heartbeat(self, *, user_id: str, when: Optional[datetime] = None) -> None:
		day = _day_stamp(when)
		await self._touch(user_id, day=day)

	async def get_daily_counters(self, *, day: str, user_id: str) -> DailyCounters:
		mapping = await self._redis.hgetall(_hash_key(day, user_id))
		return DailyCounters.from_mapping(mapping)

	async def list_user_ids_for_day(self, day: str) -> list[str]:
		pattern = f"lb:day:{day}:user:*"
		cursor: int | str = 0
		acc: list[str] = []
		while True:
			cursor, keys = await self._redis.scan(cursor=cursor, match=pattern, count=500)
			for key in keys:
				acc.append(key.rsplit(":", 1)[-1])
			if int(cursor) == 0:
				break
		return sorted(set(acc))

	async def fetch_user_campus(self, user_id: str) -> Optional[str]:
		cached = await self._redis.get(f"user:campus:{user_id}")
		if cached:
			return cached
		pool = await get_pool()
		async with pool.acquire() as conn:
			return await _ensure_campus_cache(conn, user_id)
