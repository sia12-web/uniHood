"""Redis-backed timer helpers for mini-activities."""

from __future__ import annotations

import json
from typing import Any, Dict

from app.infra.redis import redis_client


def _state_key(activity_id: str) -> str:
	return f"act:{activity_id}:state"


def _round_key(activity_id: str, round_idx: int) -> str:
	return f"act:{activity_id}:timer:round:{round_idx}"


async def cache_state(activity_id: str, snapshot: Dict[str, Any], *, ttl_seconds: int = 3_600) -> None:
	await redis_client.set(_state_key(activity_id), json.dumps(snapshot), ex=ttl_seconds)


async def get_cached_state(activity_id: str) -> Dict[str, Any] | None:
	value = await redis_client.get(_state_key(activity_id))
	if not value:
		return None
	return json.loads(value)


async def set_round_timer(activity_id: str, round_idx: int, duration_s: int) -> None:
	await redis_client.set(_round_key(activity_id, round_idx), "1", ex=max(duration_s, 1))


async def clear_round_timer(activity_id: str, round_idx: int) -> None:
	await redis_client.delete(_round_key(activity_id, round_idx))


async def round_timer_ttl(activity_id: str, round_idx: int) -> int:
	ttl = await redis_client.ttl(_round_key(activity_id, round_idx))
	return max(ttl, -1)
