"""Redis accrual utilities for leaderboards streams."""

from __future__ import annotations

from datetime import datetime, timezone
from typing import Iterable, Optional

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

	async def record_friendship_accepted(self, *, user_a: str, user_b: str, when: Optional[datetime] = None) -> None:
		day = _day_stamp(when)
		await self._hincr(_hash_key(day, user_a), "friends_new", 1)
		await self._hincr(_hash_key(day, user_b), "friends_new", 1)
		await self._touch(user_a, day=day)
		await self._touch(user_b, day=day)

	async def record_dm_sent(self, *, from_user_id: str, to_user_id: str, when: Optional[datetime] = None) -> None:
		when = when or _now()
		day = _day_stamp(when)
		if await policy.register_burst_and_mute(from_user_id, "dm", now=when):
			return
		await self._hincr_float(_hash_key(day, from_user_id), "dm_sent", 1.0)
		await self._sadd(_uniq_sender_key(day, to_user_id), from_user_id)
		await self._touch(from_user_id, day=day)
		await self._touch(to_user_id, day=day)

	async def record_room_message(self, *, user_id: str, when: Optional[datetime] = None) -> None:
		day = _day_stamp(when)
		if await policy.register_burst_and_mute(user_id, "room_chat", now=when or _now()):
			return
		await self._hincr_float(_hash_key(day, user_id), "room_sent", 1.0)
		await self._touch(user_id, day=day)

	async def record_room_created(self, *, user_id: str, when: Optional[datetime] = None) -> None:
		day = _day_stamp(when)
		await self._hincr(_hash_key(day, user_id), "rooms_created", 1)
		await self._touch(user_id, day=day)

	async def record_room_joined(self, *, user_id: str, when: Optional[datetime] = None) -> None:
		day = _day_stamp(when)
		await self._hincr(_hash_key(day, user_id), "rooms_joined", 1)
		await self._touch(user_id, day=day)

	async def record_activity_ended(
		self,
		*,
		user_ids: Iterable[str],
		winner_id: Optional[str] = None,
		when: Optional[datetime] = None,
	) -> None:
		day = _day_stamp(when)
		for uid in user_ids:
			await self._hincr(_hash_key(day, uid), "acts_played", 1)
			await self._touch(uid, day=day)
		if winner_id:
			await self._hincr(_hash_key(day, winner_id), "acts_won", 1)

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
