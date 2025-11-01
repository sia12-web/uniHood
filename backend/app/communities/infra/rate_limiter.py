"""Communities-specific rate limiting helpers."""

from __future__ import annotations

from app.infra import rate_limit

_EMIT_LIMIT = 50


async def allow_emit(namespace: str, actor_id: str, *, limit: int | None = None) -> bool:
	"""Throttle realtime emits per namespace and actor."""
	budget = limit or _EMIT_LIMIT
	return await rate_limit.allow(
		kind=f"comm:emit:{namespace}",
		actor_id=actor_id,
		limit=budget,
		window_seconds=1,
	)


async def allow_notification(user_id: str, *, limit: int = 5) -> bool:
	"""Throttle notification persistence down-stream."""
	return await rate_limit.allow(
		kind="comm:notif",
		actor_id=user_id,
		limit=limit,
		window_seconds=1,
	)
