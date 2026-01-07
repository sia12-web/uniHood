"""Socket.IO namespace for chat transport."""

from __future__ import annotations

import json
from typing import Dict, Optional

import socketio

from app.domain.proximity import live_sessions
from app.infra.auth import AuthenticatedUser, _parse_token as parse_access_token
from app.infra.redis import redis_client
from app.settings import settings
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

	async def on_connect(self, sid: str, environ: dict, auth: Optional[dict] = None) -> None:
		obs_metrics.socket_connected(self.namespace)
		try:
			user = await self._authorise(environ, auth)
		except Exception:
			obs_metrics.socket_disconnected(self.namespace)
			raise ConnectionRefusedError("unauthorized") from None
		self._sessions[sid] = user
		await self.enter_room(sid, self.user_room(user.id))
		await self.emit("chat:ack", {"ok": True}, room=sid)
		await live_sessions.attach_activity(user.id)

	async def on_disconnect(self, sid: str) -> None:
		obs_metrics.socket_disconnected(self.namespace)
		user = self._sessions.pop(sid, None)
		if user:
			await self.leave_room(sid, self.user_room(user.id))
			await live_sessions.detach_activity(user.id)

	async def on_typing(self, sid: str, payload: dict | None = None) -> None:
		obs_metrics.socket_event(self.namespace, "typing")
		user = self._sessions.get(sid)
		if not user:
			raise ConnectionRefusedError("unauthenticated")
		payload = payload or {}
		peer_id = str(payload.get("peer_id")) if payload.get("peer_id") is not None else ""
		if not peer_id:
			return
		await self.emit(
			"chat:typing",
			{"from_user_id": user.id, "peer_id": peer_id},
			room=self.user_room(peer_id),
		)

	async def on_hb(self, sid: str) -> None:
		"""Handle application-level heartbeat from client."""
		# We don't need to do much, just receiving it keeps the connection active
		# and confirms the application logic is still responsive.
		pass

	async def _authorise(self, environ: dict, auth: Optional[dict]) -> AuthenticatedUser:
		scope = environ.get("asgi.scope", environ)
		auth_payload = auth or environ.get("auth") or scope.get("auth") or {}
		ticket = auth_payload.get("ticket")
		ctx: Dict[str, Optional[str]]

		def _dev_fallback_context() -> Dict[str, Optional[str]]:
			user_id = auth_payload.get("user_id") or auth_payload.get("userId")
			campus_id = auth_payload.get("campus_id") or auth_payload.get("campusId") or "dev-campus"
			session_id = auth_payload.get("session_id") or auth_payload.get("sessionId") or "dev-session"
			handle = auth_payload.get("handle")
			return {
				"user_id": user_id,
				"campus_id": campus_id,
				"session_id": session_id,
				"handle": handle,
			}

		if ticket:
			key = f"rticket:{ticket}"
			cached = await redis_client.get(key)
			if not cached:
				if settings.is_dev():
					ctx = _dev_fallback_context()
				else:
					raise ValueError("invalid_ticket")
			else:
				await redis_client.delete(key)
				try:
					parsed = json.loads(cached)
				except json.JSONDecodeError as exc:
					if settings.is_dev():
						ctx = _dev_fallback_context()
					else:
						raise ValueError("invalid_ticket") from exc
				else:
					ctx = {
						"user_id": parsed.get("user_id"),
						"campus_id": parsed.get("campus_id"),
						"session_id": parsed.get("session_id"),
						"handle": parsed.get("handle"),
					}
		else:
			token = auth_payload.get("token")
			if not token:
				auth_header = _header(scope, "authorization")
				if auth_header and auth_header.lower().startswith("bearer "):
					token = auth_header.split(" ", 1)[1]
				if not token:
					# In dev, allow direct identity fields to keep local sockets usable without JWTs.
					if settings.is_dev():
						user_id = auth_payload.get("user_id") or auth_payload.get("userId")
						campus_id = auth_payload.get("campus_id") or auth_payload.get("campusId")
						session_id = auth_payload.get("session_id") or auth_payload.get("sessionId") or "dev-session"
						handle = auth_payload.get("handle")
						if user_id and campus_id:
							ctx = {
								"user_id": user_id,
								"campus_id": campus_id,
								"session_id": session_id,
								"handle": handle,
							}
						else:
							raise ValueError("missing_token")
					else:
						raise ValueError("missing_token")
				else:
					try:
						ctx = parse_access_token(token)
					except Exception:
						# Dev fallback: when using synthetic/local tokens without campus claims,
						# fall back to explicit handshake fields so sockets stay usable.
						if settings.is_dev():
							ctx = _dev_fallback_context()
							if not ctx.get("user_id") or ctx.get("campus_id") is None:
								raise
							else:
								pass
						else:
							raise

		if not ctx.get("campus_id") and settings.is_dev():
			ctx["campus_id"] = auth_payload.get("campus_id") or auth_payload.get("campusId") or "dev-campus"
			if not ctx.get("session_id") and settings.is_dev():
				ctx["session_id"] = auth_payload.get("session_id") or auth_payload.get("sessionId") or "dev-session"

			if not ctx.get("user_id") or ctx.get("campus_id") is None:
				raise ValueError("missing_claims")

		return AuthenticatedUser(
			id=str(ctx["user_id"]),
			campus_id=str(ctx["campus_id"]),
			handle=str(ctx["handle"]) if ctx.get("handle") is not None else None,
			session_id=str(ctx["session_id"]) if ctx.get("session_id") is not None else None,
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
