"""Socket.IO namespace for room fanout."""

from __future__ import annotations

import json
from typing import Dict, Optional

import socketio

from app.domain.rooms import policy
from app.infra.auth import AuthenticatedUser, _parse_token as parse_access_token
from app.infra.redis import redis_client
from app.settings import settings
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

	async def on_connect(self, sid: str, environ: dict, auth: Optional[dict] = None) -> None:
		obs_metrics.socket_connected(self.namespace)
		try:
			user = await self._authorise(environ, auth)
		except Exception:
			obs_metrics.socket_disconnected(self.namespace)
			raise ConnectionRefusedError("unauthorized") from None
		self._sessions[sid] = user
		await self.enter_room(sid, self.user_room(user.id))
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

	async def _authorise(self, environ: dict, auth: Optional[dict]) -> AuthenticatedUser:
		scope = environ.get("asgi.scope", environ)
		auth_payload = auth or environ.get("auth") or scope.get("auth") or {}
		ctx: Optional[Dict[str, Optional[str]]] = None
		ticket = auth_payload.get("ticket")
		if ticket:
			ctx = await self._consume_ticket(str(ticket))
		if ctx is None:
			token = auth_payload.get("token")
			if not token:
				auth_header = _header(scope, "authorization")
				if auth_header and auth_header.lower().startswith("bearer "):
					token = auth_header.split(" ", 1)[1]
			if not token:
				if settings.is_dev():
					user_id = auth_payload.get("user_id") or auth_payload.get("userId")
					campus_id = auth_payload.get("campus_id") or auth_payload.get("campusId") or "dev-campus"
					session_id = auth_payload.get("session_id") or auth_payload.get("sessionId") or "dev-session"
					if user_id:
						ctx = {
							"user_id": user_id,
							"campus_id": campus_id,
							"session_id": session_id,
						}
				if ctx is None:
					raise ValueError("missing_token")
			else:
				ctx = parse_access_token(str(token))
		if not ctx or not ctx.get("user_id"):
			raise ValueError("missing_claims")
		campus_id = ctx.get("campus_id") or ("dev-campus" if settings.is_dev() else "")
		return AuthenticatedUser(
			id=str(ctx["user_id"]),
			campus_id=str(campus_id or ""),
			session_id=str(ctx.get("session_id")) if ctx.get("session_id") else None,
		)

	async def _consume_ticket(self, ticket: str) -> Optional[Dict[str, Optional[str]]]:
		key = f"rticket:{ticket}"
		cached = await redis_client.get(key)
		if not cached:
			return None
		await redis_client.delete(key)
		try:
			parsed = json.loads(cached)
		except json.JSONDecodeError:
			return None
		user_id = parsed.get("user_id")
		campus_id = parsed.get("campus_id")
		session_id = parsed.get("session_id")
		if not user_id or campus_id is None:
			return None
		return {
			"user_id": str(user_id),
			"campus_id": str(campus_id),
			"session_id": str(session_id) if session_id is not None else None,
		}


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
