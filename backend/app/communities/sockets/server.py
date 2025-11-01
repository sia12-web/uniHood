"""Entry-point utilities for emitting via communities Socket.IO namespaces."""

from __future__ import annotations

from typing import Optional

from app.communities.sockets.namespaces.events import EventNamespace
from app.communities.sockets.namespaces.groups import GroupNamespace
from app.communities.sockets.namespaces.posts import PostNamespace
from app.communities.sockets.namespaces.user import UserNamespace
from app.obs import metrics as obs_metrics

_group_ns: Optional[GroupNamespace] = None
_post_ns: Optional[PostNamespace] = None
_event_ns: Optional[EventNamespace] = None
_user_ns: Optional[UserNamespace] = None


def set_namespaces(
	*,
	groups: GroupNamespace,
	posts: PostNamespace,
	events: EventNamespace,
	user: UserNamespace,
) -> None:
	global _group_ns, _post_ns, _event_ns, _user_ns
	_group_ns = groups
	_post_ns = posts
	_event_ns = events
	_user_ns = user


async def emit_group(group_id: str, event: str, payload: dict) -> None:
	if _group_ns is None:
		return
	obs_metrics.socket_event(_group_ns.namespace, event)
	await _group_ns.emit(event, payload, room=GroupNamespace.room_name(group_id))


async def emit_post(post_id: str, event: str, payload: dict) -> None:
	if _post_ns is None:
		return
	obs_metrics.socket_event(_post_ns.namespace, event)
	await _post_ns.emit(event, payload, room=PostNamespace.room_name(post_id))


async def emit_event(event_id: str, event: str, payload: dict) -> None:
	if _event_ns is None:
		return
	obs_metrics.socket_event(_event_ns.namespace, event)
	await _event_ns.emit(event, payload, room=EventNamespace.room_name(event_id))


async def emit_user(user_id: str, event: str, payload: dict) -> None:
	if _user_ns is None:
		return
	obs_metrics.socket_event(_user_ns.namespace, event)
	await _user_ns.emit(event, payload, room=UserNamespace.room_name(user_id))
