"""User-specific namespace for notifications and presence changes."""

from __future__ import annotations

from app.communities.sockets.namespaces.base import BaseCommunitiesNamespace
from app.obs import metrics as obs_metrics


class UserNamespace(BaseCommunitiesNamespace):
	"""Provides /user namespace that places clients in a personal room."""

	def __init__(self) -> None:
		super().__init__("/user")

	async def on_connect(self, sid: str, environ: dict) -> None:
		obs_metrics.socket_connected(self.namespace)
		user = self._resolve_user(environ)
		scope = environ.get("asgi.scope", environ)
		auth_payload = environ.get("auth") or scope.get("auth") or {}
		target_user = auth_payload.get("userId")
		if target_user and target_user != user.id:
			obs_metrics.socket_disconnected(self.namespace)
			raise ConnectionRefusedError("user_mismatch")
		self._sessions[sid] = user
		await self.enter_room(sid, self.room_name(user.id))
		await self.emit("user:ready", {"user_id": user.id}, room=sid)

	async def on_disconnect(self, sid: str) -> None:
		obs_metrics.socket_disconnected(self.namespace)
		user = self._sessions.pop(sid, None)
		if user:
			await self.leave_room(sid, self.room_name(user.id))

	@staticmethod
	def room_name(user_id: str) -> str:
		return f"user:{user_id}"
