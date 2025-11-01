"""Redis stream fan-out helpers for communities domain."""

from __future__ import annotations

import json
from datetime import datetime, timezone
from typing import Any

from app.infra.redis import redis_client

_STREAM_POST = "comm:post"
_STREAM_COMMENT = "comm:comment"
_STREAM_EVENT = "comm:event"
_STREAM_RSVP = "comm:rsvp"
_STREAM_NOTIFICATION_BUILD = "comm:notif:build"
STREAM_NOTIFICATION_OUTBOUND = "notif:outbound"

# Expose stream names for worker configuration.
STREAM_POST = _STREAM_POST
STREAM_COMMENT = _STREAM_COMMENT
STREAM_EVENT = _STREAM_EVENT
STREAM_RSVP = _STREAM_RSVP
STREAM_NOTIFICATION_BUILD = _STREAM_NOTIFICATION_BUILD


def _now_ts() -> str:
	return datetime.now(timezone.utc).isoformat()


async def publish_post_event(event: str, *, post_id: str, group_id: str, actor_id: str | None = None) -> None:
	payload: dict[str, Any] = {
		"event": event,
		"entity": "post",
		"id": post_id,
		"group_id": group_id,
		"ts": _now_ts(),
	}
	if actor_id:
		payload["actor_id"] = actor_id
	await redis_client.xadd(_STREAM_POST, payload)


async def publish_comment_event(
	event: str,
	*,
	comment_id: str,
	post_id: str,
	group_id: str,
	actor_id: str | None = None,
) -> None:
	payload: dict[str, Any] = {
		"event": event,
		"entity": "comment",
		"id": comment_id,
		"post_id": post_id,
		"group_id": group_id,
		"ts": _now_ts(),
	}
	if actor_id:
		payload["actor_id"] = actor_id
	await redis_client.xadd(_STREAM_COMMENT, payload)


async def publish_event_event(
	event: str,
	*,
	event_id: str,
	group_id: str,
	actor_id: str | None = None,
) -> None:
	payload: dict[str, Any] = {
		"event": event,
		"entity": "event",
		"id": event_id,
		"group_id": group_id,
		"ts": _now_ts(),
	}
	if actor_id:
		payload["actor_id"] = actor_id
	await redis_client.xadd(_STREAM_EVENT, payload)


async def publish_rsvp_event(
	event: str,
	*,
	rsvp_id: str,
	event_id: str,
	user_id: str,
	actor_id: str | None = None,
) -> None:
	payload: dict[str, Any] = {
		"event": event,
		"entity": "rsvp",
		"id": rsvp_id,
		"event_id": event_id,
		"user_id": user_id,
		"ts": _now_ts(),
	}
	if actor_id:
		payload["actor_id"] = actor_id
	await redis_client.xadd(_STREAM_RSVP, payload)


async def enqueue_notification_build(
	*,
	type: str,
	ref_id: str,
	user_ids: list[str],
	actor_id: str,
	group_id: str | None = None,
	data: dict[str, Any] | None = None,
) -> None:
	payload: dict[str, Any] = {
		"type": type,
		"ref_id": ref_id,
		"actor_id": actor_id,
		"ts": _now_ts(),
		"user_ids": ",".join(user_ids),
	}
	if group_id:
		payload["group_id"] = group_id
	if data:
		payload["data"] = json.dumps(data)
	await redis_client.xadd(_STREAM_NOTIFICATION_BUILD, payload)


__all__ = [
	"publish_post_event",
	"publish_comment_event",
	"publish_event_event",
	"publish_rsvp_event",
	"enqueue_notification_build",
	"STREAM_POST",
	"STREAM_COMMENT",
	"STREAM_EVENT",
	"STREAM_RSVP",
	"STREAM_NOTIFICATION_BUILD",
	"STREAM_NOTIFICATION_OUTBOUND",
]
