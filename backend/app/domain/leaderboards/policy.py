"""Policy helpers for leaderboards & streaks."""

from __future__ import annotations

from datetime import datetime
import uuid

from app.domain.leaderboards.models import DailyCounters
from app.infra.redis import redis_client


# --- Scoring weights and caps ---
W_INVITE_ACCEPT = 3.0
W_FRIEND_NEW = 5.0
W_DM_SENT = 0.3
W_ROOM_SENT = 0.15
W_ACT_PLAYED = 2.0
W_ACT_WON = 3.0
W_ROOM_JOIN = 1.0
W_ROOM_CREATE = 2.0
W_POP_UNIQ_SENDER = 1.0
W_POP_UNIQ_INVITE_FROM = 2.0

DM_SENT_CAP = 60.0
ROOM_SENT_CAP = 80.0
ROOM_JOIN_CAP = 6
ROOM_CREATE_CAP = 2
UNIQ_SENDER_CAP = 20
UNIQ_INVITE_CAP = 10

STREAK_MULT_MIN = 1.0
STREAK_MULT_MAX = 1.5
STREAK_AT_30 = 30


# --- Anti-gaming configuration ---
BURST_RPS_THRESHOLD = 5  # messages per second
BURST_WINDOW_SECONDS = 10
MUTED_TTL_SECONDS = 10


def clamp_daily_counters(counters: DailyCounters) -> DailyCounters:
	"""Apply policy caps to a set of counters."""

	counters.dm_sent = min(counters.dm_sent, DM_SENT_CAP)
	counters.room_sent = min(counters.room_sent, ROOM_SENT_CAP)
	counters.rooms_joined = min(counters.rooms_joined, ROOM_JOIN_CAP)
	counters.rooms_created = min(counters.rooms_created, ROOM_CREATE_CAP)
	counters.uniq_senders = min(counters.uniq_senders, UNIQ_SENDER_CAP)
	counters.uniq_invite_accept_from = min(counters.uniq_invite_accept_from, UNIQ_INVITE_CAP)
	return counters


def streak_multiplier(days_active: int) -> float:
	"""Compute streak multiplier per spec (linear 1.0→1.5 across 1..30)."""

	if days_active <= 1:
		return STREAK_MULT_MIN
	if days_active >= STREAK_AT_30:
		return STREAK_MULT_MAX
	span = STREAK_AT_30 - 1
	progress = max(days_active - 1, 0) / span
	return STREAK_MULT_MIN + (STREAK_MULT_MAX - STREAK_MULT_MIN) * progress


async def is_muted(user_id: str, channel: str) -> bool:
	"""Return True when the user is muted for leaderboard accrual."""

	mute_key = f"lb:muted:{channel}:{user_id}"
	ttl = await redis_client.ttl(mute_key)
	if ttl is None:
		return False
	if ttl < 0:
		return False
	return ttl > 0


async def register_burst_and_mute(user_id: str, channel: str, *, now: datetime) -> bool:
	"""Record a message event and mute user if >5 rps for >10s."""

	if await is_muted(user_id, channel):
		return True

	key = f"lb:burst:{channel}:{user_id}"
	score = now.timestamp()
	member = f"{score}:{uuid.uuid4().hex}"
	await redis_client.zadd(key, {member: score})
	window_start = score - BURST_WINDOW_SECONDS
	await redis_client.zremrangebyscore(key, 0, window_start)
	await redis_client.expire(key, BURST_WINDOW_SECONDS * 2)

	event_count = await redis_client.zcount(key, window_start, score)
	threshold = BURST_RPS_THRESHOLD * BURST_WINDOW_SECONDS
	if event_count > threshold:
		mute_key = f"lb:muted:{channel}:{user_id}"
		await redis_client.setex(mute_key, MUTED_TTL_SECONDS, "1")
		return True
	return False
