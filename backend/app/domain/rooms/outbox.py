"""Outbox helpers for room-domain events."""

from __future__ import annotations

from typing import Any, Mapping, Optional

from app.infra.redis import redis_client

ROOM_EVENT_STREAM = "x:rooms.events"
ROOM_CHAT_STREAM = "x:roomchat.events"


async def append_room_event(event: str, room_id: str, *, user_id: str | None = None, meta: Mapping[str, Any] | None = None) -> None:
	fields: dict[str, Any] = {
		"event": event,
		"room_id": room_id,
	}
	if user_id:
		fields["user_id"] = str(user_id)
	if meta:
		for key, value in meta.items():
			fields[f"meta_{key}"] = str(value)
	await redis_client.xadd(ROOM_EVENT_STREAM, fields)


async def append_room_chat_event(
	event: str,
	*,
	room_id: str,
	msg_id: str,
	seq: int,
	user_id: Optional[str] = None,
	meta: Mapping[str, Any] | None = None,
) -> None:
	fields: dict[str, Any] = {
		"event": event,
		"room_id": room_id,
		"msg_id": msg_id,
		"seq": str(seq),
	}
	if user_id:
		fields["user_id"] = str(user_id)
	if meta:
		for key, value in meta.items():
			fields[f"meta_{key}"] = str(value)
	await redis_client.xadd(ROOM_CHAT_STREAM, fields)

