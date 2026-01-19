"""Socket.IO namespace for social updates (invites & friendships)."""

from __future__ import annotations

from typing import Optional

import socketio

from app.infra.auth import AuthenticatedUser
from app.infra.redis import redis_client
from app.obs import metrics as obs_metrics

_namespace: "SocialNamespace" | None = None
_ONLINE_TTL = 300  # 5 minutes


def _header(scope: dict, name: str) -> Optional[str]:
	target = name.encode().lower()
	for key, value in scope.get("headers", []):
		if key.lower() == target:
			return value.decode()
	return None


class SocialNamespace(socketio.AsyncNamespace):
	"""Namespace that keeps each client in their personal room."""

	def __init__(self) -> None:
		super().__init__("/social")
		self._sessions: dict[str, AuthenticatedUser] = {}

	async def _mark_online(self, user_id: str) -> None:
		"""Mark user as online in Redis for friend activity."""
		# We use the same key as proximity to ensure consistent 'Online' status
		# regardless of whether it came from a map heartbeat or app activity.
		await redis_client.setex(f"online:user:{user_id}", _ONLINE_TTL, "1")

	async def on_connect(self, sid: str, environ: dict, auth: Optional[dict] = None) -> None:
		obs_metrics.socket_connected(self.namespace)
		scope = environ.get("asgi.scope", environ)
		# python-socketio >=5 passes client-provided auth as a separate argument
		auth_payload = auth or environ.get("auth") or scope.get("auth") or {}
		user_id = auth_payload.get("userId") or _header(scope, "x-user-id")
		campus_id = auth_payload.get("campusId") or _header(scope, "x-campus-id")
		if not user_id:
			obs_metrics.socket_disconnected(self.namespace)
			raise ConnectionRefusedError("missing user id")
		user = AuthenticatedUser(id=user_id, campus_id=campus_id or "")
		self._sessions[sid] = user
		await self.enter_room(sid, self.user_room(user_id))
		await self._mark_online(user_id)
		await self.emit("social:ack", {"ok": True}, room=sid)

	async def on_disconnect(self, sid: str) -> None:
		obs_metrics.socket_disconnected(self.namespace)
		user = self._sessions.pop(sid, None)
		if user:
			await self.leave_room(sid, self.user_room(user.id))

	async def on_subscribe_self(self, sid: str, payload: dict | None = None) -> None:
		obs_metrics.socket_event(self.namespace, "subscribe_self")
		user = self._sessions.get(sid)
		if not user:
			raise ConnectionRefusedError("unauthenticated")
		await self.enter_room(sid, self.user_room(user.id))
		await self._mark_online(user.id)

	async def on_hb(self, sid: str) -> None:
		"""Handle application-level heartbeat from client."""
		user = self._sessions.get(sid)
		if user:
			await self._mark_online(user.id)

	@staticmethod
	def user_room(user_id: str) -> str:
		return f"user:{user_id}"


def set_namespace(ns: SocialNamespace) -> None:
	global _namespace
	_namespace = ns


async def emit_invite_new(user_id: str, payload: dict) -> None:
	if _namespace is None:
		return
	obs_metrics.socket_event(_namespace.namespace, "invite:new")
	await _namespace.emit("invite:new", payload, room=SocialNamespace.user_room(user_id))


async def emit_invite_update(user_id: str, payload: dict) -> None:
	if _namespace is None:
		return
	obs_metrics.socket_event(_namespace.namespace, "invite:update")
	await _namespace.emit("invite:update", payload, room=SocialNamespace.user_room(user_id))


async def emit_friend_update(user_id: str, payload: dict) -> None:
	if _namespace is None:
		return
	obs_metrics.socket_event(_namespace.namespace, "friend:update")
	await _namespace.emit("friend:update", payload, room=SocialNamespace.user_room(user_id))


async def emit_discovery_match(user_id: str, payload: dict) -> None:
	"""Notify a user that a discovery match was formed."""
	if _namespace is None:
		return
	obs_metrics.socket_event(_namespace.namespace, "discovery:match")
	await _namespace.emit("discovery:match", payload, room=SocialNamespace.user_room(user_id))


async def emit_notification_new(user_id: str, payload: dict) -> None:
	if _namespace is None:
		return
	obs_metrics.socket_event(_namespace.namespace, "notification:new")
	await _namespace.emit("notification:new", payload, room=SocialNamespace.user_room(user_id))


async def emit_notification_read(user_id: str, payload: dict) -> None:
	if _namespace is None:
		return
	obs_metrics.socket_event(_namespace.namespace, "notification:read")
	await _namespace.emit("notification:read", payload, room=SocialNamespace.user_room(user_id))
