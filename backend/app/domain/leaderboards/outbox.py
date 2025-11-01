"""Outbox helpers for leaderboards metrics streams."""

from __future__ import annotations

from typing import Any, Dict

from app.infra.redis import redis_client
from app.obs import metrics as obs_metrics

LEADERBOARD_STREAM = "x:leaderboards.events"


async def append_event(event_type: str, payload: Dict[str, Any]) -> None:
	"""Append a structured event to the leaderboards stream."""

	body = {"type": event_type, **{k: str(v) for k, v in payload.items()}}
	await redis_client.xadd(LEADERBOARD_STREAM, body, maxlen=2000, approximate=False)


async def increment_counter(name: str, value: int = 1, **tags: str) -> None:
	"""Increment a Prometheus-style counter stored in Redis."""

	tag_str = ",".join(f"{k}={v}" for k, v in sorted(tags.items()))
	key = f"metrics:{name}:{tag_str}" if tag_str else f"metrics:{name}"
	await redis_client.incrby(key, value)
	await redis_client.expire(key, 7 * 24 * 60 * 60)


async def record_snapshot(scope: str, period: str, campus_id: str, ymd: int, entries: int) -> None:
	await append_event(
		"snapshot",
		{"scope": scope, "period": period, "campus_id": campus_id, "ymd": ymd, "entries": entries},
	)
	await increment_counter("lb_snapshots_total", period=period, scope=scope)
	obs_metrics.inc_leaderboard_snapshot(period, scope)


async def record_badge_awarded(kind: str) -> None:
	await increment_counter("lb_badges_awarded_total", kind=kind)
	obs_metrics.inc_leaderboard_event(f"badge:{kind}")
