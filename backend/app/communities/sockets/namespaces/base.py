"""Shared helpers for communities Socket.IO namespaces."""

from __future__ import annotations

from typing import Dict, Optional

import socketio

from app.infra.auth import AuthenticatedUser


def _header(scope: dict, name: str) -> Optional[str]:
	target = name.encode().lower()
	for key, value in scope.get("headers", []):
		if key.lower() == target:
			return value.decode()
	return None


class BaseCommunitiesNamespace(socketio.AsyncNamespace):
	"""Base namespace that extracts AuthenticatedUser from handshake headers."""

	def __init__(self, namespace: str) -> None:
		super().__init__(namespace)
		self._sessions: Dict[str, AuthenticatedUser] = {}

	def _resolve_user(self, environ: dict) -> AuthenticatedUser:
		scope = environ.get("asgi.scope", environ)
		auth_payload = environ.get("auth") or scope.get("auth") or {}
		user_id = auth_payload.get("userId") or _header(scope, "x-user-id")
		campus_id = auth_payload.get("campusId") or _header(scope, "x-campus-id") or ""
		roles_raw = auth_payload.get("roles") or _header(scope, "x-user-roles") or ""
		roles = tuple(filter(None, roles_raw.split(",")))
		if not user_id:
			raise ConnectionRefusedError("missing user id")
		return AuthenticatedUser(id=user_id, campus_id=campus_id, roles=roles)

	def get_user(self, sid: str) -> Optional[AuthenticatedUser]:
		return self._sessions.get(sid)
