"""Policy and guard helpers for mini-activities."""

from __future__ import annotations

from datetime import datetime, timedelta, timezone
from typing import Optional

import asyncpg

from app.domain.activities import models
from app.domain.social import policy as social_policy
from app.infra.postgres import get_pool
from app.infra.redis import redis_client


CREATE_LIMIT_PER_DAY = 50
ACTION_LIMIT_PER_MINUTE = 120
DEFAULT_IDLE_EXPIRE_MINUTES = 15


class ActivityPolicyError(RuntimeError):
	def __init__(self, code: str, *, status_code: int = 400, message: str | None = None) -> None:
		super().__init__(message or code)
		self.code = code
		self.status_code = status_code
		self.detail = message or code


async def _touch_limit(key: str, ttl_seconds: int) -> int:
	async with redis_client.pipeline(transaction=True) as pipe:
		pipe.incr(key)
		pipe.expire(key, ttl_seconds)
		count, _ = await pipe.execute()
	return int(count)


async def enforce_create_limit(user_id: str) -> None:
	now = datetime.now(timezone.utc)
	bucket = now.strftime("%Y%m%d")
	key = f"rl:act:create:{user_id}:{bucket}"
	if await _touch_limit(key, 86_400) > CREATE_LIMIT_PER_DAY:
		raise ActivityPolicyError("rate_limited:create", status_code=429)


async def enforce_action_limit(user_id: str) -> None:
	now = datetime.now(timezone.utc)
	bucket = now.strftime("%Y%m%d%H%M")
	key = f"rl:act:action:{user_id}:{bucket}"
	if await _touch_limit(key, 120) > ACTION_LIMIT_PER_MINUTE:
		raise ActivityPolicyError("rate_limited:action", status_code=429)


async def ensure_friends(user_a: str, user_b: str) -> None:
	pool = await get_pool()
	async with pool.acquire() as conn:
		await _ensure_friends_conn(conn, user_a, user_b)


async def _ensure_friends_conn(conn: asyncpg.Connection, user_a: str, user_b: str) -> None:
	if not await social_policy.are_friends(conn, user_a, user_b):
		raise ActivityPolicyError("not_friends", status_code=403)


def ensure_participant(activity: models.Activity, user_id: str) -> None:
	if not activity.includes(user_id):
		raise ActivityPolicyError("not_participant", status_code=403)


def ensure_state(activity: models.Activity, *states: str) -> None:
	if activity.state not in states:
		raise ActivityPolicyError("invalid_state", status_code=409)


def ensure_round_state(round_obj: models.ActivityRound, *states: str) -> None:
	if round_obj.state not in states:
		raise ActivityPolicyError("invalid_round_state", status_code=409)


def ensure_turn(meta: dict, user_id: str) -> None:
	current = meta.get("next_user")
	if current and str(current) != str(user_id):
		raise ActivityPolicyError("not_your_turn", status_code=403)


def ensure_story_length(content: str, limit: int) -> None:
	if len(content) > limit:
		raise ActivityPolicyError("turn_too_long", status_code=422)


def guard_trivia_choice(choice_idx: int) -> None:
	if choice_idx < 0 or choice_idx > 3:
		raise ActivityPolicyError("invalid_choice", status_code=422)


def ensure_commit_exists(commit: Optional[models.RpsMove]) -> None:
	if commit is None or not commit.commit_hash:
		raise ActivityPolicyError("missing_commit", status_code=409)


def ensure_commit_phase(move: models.RpsMove, expected: str) -> None:
	if move.phase != expected:
		raise ActivityPolicyError("invalid_phase", status_code=409)


def ensure_choice_valid(choice: str) -> None:
	if choice not in {"rock", "paper", "scissors"}:
		raise ActivityPolicyError("invalid_choice", status_code=422)


def ensure_deadline(opened_at: datetime | None, duration_s: int, *, now: Optional[datetime] = None) -> None:
	if opened_at is None:
		raise ActivityPolicyError("round_not_open", status_code=409)
	now = now or datetime.now(timezone.utc)
	deadline = opened_at + timedelta(seconds=duration_s)
	if now > deadline:
		raise ActivityPolicyError("round_closed", status_code=410)


def ensure_activity_idle(activity: models.Activity, *, last_ts: datetime, limit_minutes: int = DEFAULT_IDLE_EXPIRE_MINUTES) -> bool:
	if activity.state in {"completed", "cancelled", "expired"}:
		return True
	deadline = activity.started_at or activity.created_at
	if not deadline:
		return False
	return (last_ts - deadline).total_seconds() >= limit_minutes * 60
