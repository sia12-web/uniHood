"""Socket.IO namespace for room fanout."""

from __future__ import annotations

from typing import Dict, Optional

import socketio

from app.domain.rooms import policy
from app.infra.auth import AuthenticatedUser
from app.obs import metrics as obs_metrics

_namespace: "RoomsNamespace" | None = None


def _header(scope: dict, name: str) -> Optional[str]:
	target = name.encode().lower()
	for key, value in scope.get("headers", []):
		if key.lower() == target:
			return value.decode()
	return None


class RoomsNamespace(socketio.AsyncNamespace):
	"""Namespace that manages user + room level channels."""

	def __init__(self) -> None:
		super().__init__("/rooms")
		self._sessions: Dict[str, AuthenticatedUser] = {}

	async def on_connect(self, sid: str, environ: dict) -> None:
		obs_metrics.socket_connected(self.namespace)
		scope = environ.get("asgi.scope", environ)
		auth_payload = environ.get("auth") or scope.get("auth") or {}
		user_id = auth_payload.get("userId") or _header(scope, "x-user-id")
		campus_id = auth_payload.get("campusId") or _header(scope, "x-campus-id") or ""
		if not user_id:
			obs_metrics.socket_disconnected(self.namespace)
			raise ConnectionRefusedError("missing user id")
		user = AuthenticatedUser(id=user_id, campus_id=campus_id)
		self._sessions[sid] = user
		await self.enter_room(sid, self.user_room(user_id))
		await self.emit("rooms:ack", {"ok": True}, room=sid)

	async def on_disconnect(self, sid: str) -> None:
		obs_metrics.socket_disconnected(self.namespace)
		user = self._sessions.pop(sid, None)
		if user:
			await self.leave_room(sid, self.user_room(user.id))

	async def on_room_join(self, sid: str, payload: dict) -> None:
		obs_metrics.socket_event(self.namespace, "room_join")
		user = self._sessions.get(sid)
		if not user:
			raise ConnectionRefusedError("unauthenticated")
		room_id = str(payload.get("room_id"))
		if not room_id:
			return
		await self.enter_room(sid, self.room_channel(room_id))

	async def on_room_leave(self, sid: str, payload: dict) -> None:
		obs_metrics.socket_event(self.namespace, "room_leave")
		user = self._sessions.get(sid)
		if not user:
			raise ConnectionRefusedError("unauthenticated")
		room_id = str(payload.get("room_id"))
		if not room_id:
			return
		await self.leave_room(sid, self.room_channel(room_id))

	async def on_room_typing(self, sid: str, payload: dict) -> None:
		obs_metrics.socket_event(self.namespace, "room_typing")
		user = self._sessions.get(sid)
		if not user:
			raise ConnectionRefusedError("unauthenticated")
		room_id = str(payload.get("room_id"))
		if not room_id:
			return
		on_flag = bool(payload.get("on", True))
		await policy.enforce_typing_limit(user.id)
		await self.emit(
			"room:typing",
			{"room_id": room_id, "user_id": user.id, "on": on_flag},
			room=self.room_channel(room_id),
		)

	@staticmethod
	def user_room(user_id: str) -> str:
		return f"user:{user_id}"

	@staticmethod
	def room_channel(room_id: str) -> str:
		return f"room:{room_id}"


def set_namespace(namespace: RoomsNamespace) -> None:
	global _namespace
	_namespace = namespace


async def emit_room_created(user_id: str, payload: dict) -> None:
	if _namespace is None:
		return
	obs_metrics.socket_event(_namespace.namespace, "room:created")
	await _namespace.emit("room:created", payload, room=RoomsNamespace.user_room(user_id))


async def emit_member_event(event: str, room_id: str, payload: dict) -> None:
	if _namespace is None:
		return
	obs_metrics.socket_event(_namespace.namespace, event)
	await _namespace.emit(event, payload, room=RoomsNamespace.room_channel(room_id))


async def emit_message(event: str, room_id: str, payload: dict) -> None:
	if _namespace is None:
		return
	obs_metrics.socket_event(_namespace.namespace, event)
	await _namespace.emit(event, payload, room=RoomsNamespace.room_channel(room_id))


async def emit_room_updated(room_id: str, payload: dict) -> None:
	if _namespace is None:
		return
	obs_metrics.socket_event(_namespace.namespace, "room:updated")
	await _namespace.emit("room:updated", payload, room=RoomsNamespace.room_channel(room_id))


async def emit_user_event(user_id: str, event: str, payload: dict) -> None:
	if _namespace is None:
		return
	obs_metrics.socket_event(_namespace.namespace, event)
	await _namespace.emit(event, payload, room=RoomsNamespace.user_room(user_id))
