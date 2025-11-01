"""Redis Stream outbox writers for activities domain."""

from __future__ import annotations

from typing import Any, Mapping, Optional

from app.infra.redis import redis_client


ACTIVITY_EVENT_STREAM = "x:activities.events"
ACTIVITY_SCORE_STREAM = "x:activities.scores"


def _stringify_fields(fields: Mapping[str, Any]) -> dict[str, str]:
	return {key: str(value) for key, value in fields.items() if value is not None}


async def append_activity_event(
	event: str,
	*,
	activity_id: str,
	kind: str,
	user_id: Optional[str] = None,
	meta: Mapping[str, Any] | None = None,
) -> None:
	fields: dict[str, Any] = {
		"event": event,
		"activity_id": activity_id,
		"kind": kind,
	}
	if user_id:
		fields["user_id"] = user_id
	if meta:
		for key, value in meta.items():
			fields[f"meta_{key}"] = value
	await redis_client.xadd(ACTIVITY_EVENT_STREAM, _stringify_fields(fields))


async def append_score_event(
	*,
	activity_id: str,
	kind: str,
	result: Mapping[str, Any],
) -> None:
	fields: dict[str, Any] = {
		"activity_id": activity_id,
		"kind": kind,
	}
	for key, value in result.items():
		fields[f"result_{key}"] = value
	await redis_client.xadd(ACTIVITY_SCORE_STREAM, _stringify_fields(fields))
