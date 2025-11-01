"""Socket.IO namespace for chat transport."""

from __future__ import annotations

from typing import Dict, Optional

import socketio

from app.infra.auth import AuthenticatedUser
from app.obs import metrics as obs_metrics

_namespace: "ChatNamespace" | None = None


def _header(scope: dict, name: str) -> Optional[str]:
	target = name.encode().lower()
	for key, value in scope.get("headers", []):
		if key.lower() == target:
			return value.decode()
	return None


class ChatNamespace(socketio.AsyncNamespace):
	"""Namespace that places clients in a per-user room for direct delivery."""

	def __init__(self) -> None:
		super().__init__("/chat")
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
		await self.emit("chat:ack", {"ok": True}, room=sid)

	async def on_disconnect(self, sid: str) -> None:
		obs_metrics.socket_disconnected(self.namespace)
		user = self._sessions.pop(sid, None)
		if user:
			await self.leave_room(sid, self.user_room(user.id))

	async def on_typing(self, sid: str, payload: dict) -> None:
		obs_metrics.socket_event(self.namespace, "typing")
		user = self._sessions.get(sid)
		if not user:
			raise ConnectionRefusedError("unauthenticated")
		peer_id = str(payload.get("peer_id"))
		if not peer_id:
			return
		await self.emit(
			"chat:typing",
			{"from_user_id": user.id, "peer_id": peer_id},
			room=self.user_room(peer_id),
		)

	@staticmethod
	def user_room(user_id: str) -> str:
		return f"user:{user_id}"


def set_namespace(namespace: ChatNamespace) -> None:
	global _namespace
	_namespace = namespace


async def emit_message(user_id: str, payload: dict) -> None:
	if _namespace is None:
		return
	obs_metrics.socket_event(_namespace.namespace, "chat:message")
	await _namespace.emit("chat:message", payload, room=ChatNamespace.user_room(user_id))


async def emit_echo(user_id: str, payload: dict) -> None:
	if _namespace is None:
		return
	obs_metrics.socket_event(_namespace.namespace, "chat:echo")
	await _namespace.emit("chat:echo", payload, room=ChatNamespace.user_room(user_id))


async def emit_delivery(user_id: str, payload: dict) -> None:
	if _namespace is None:
		return
	obs_metrics.socket_event(_namespace.namespace, "chat:delivered")
	await _namespace.emit("chat:delivered", payload, room=ChatNamespace.user_room(user_id))
