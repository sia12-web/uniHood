"""Socket.IO namespace for group-level realtime events."""

from __future__ import annotations

from typing import Dict
from urllib.parse import parse_qs

from uuid import UUID

from app.communities.domain import policies, repo as repo_module
from app.communities.sockets.namespaces.base import BaseCommunitiesNamespace
from app.obs import metrics as obs_metrics


class GroupNamespace(BaseCommunitiesNamespace):
	"""Namespace for /groups connections that join a single group room."""

	def __init__(self, *, repository: repo_module.CommunitiesRepository | None = None) -> None:
		super().__init__("/groups")
		self.repo = repository or repo_module.CommunitiesRepository()
		self._groups: Dict[str, str] = {}

	async def on_connect(self, sid: str, environ: dict) -> None:
		obs_metrics.socket_connected(self.namespace)
		user = self._resolve_user(environ)
		scope = environ.get("asgi.scope", environ)
		auth_payload = environ.get("auth") or scope.get("auth") or {}
		query_string = scope.get("query_string", b"").decode()
		query_params = parse_qs(query_string)
		group_id = auth_payload.get("groupId") or (query_params.get("groupId") or [None])[0]
		if not group_id:
			obs_metrics.socket_disconnected(self.namespace)
			raise ConnectionRefusedError("missing group id")
		try:
			group_uuid = UUID(group_id)
		except ValueError as exc:
			obs_metrics.socket_disconnected(self.namespace)
			raise ConnectionRefusedError("invalid group id") from exc
		membership = await self.repo.get_member(group_uuid, UUID(user.id))
		if membership is None or membership.is_banned:
			obs_metrics.socket_disconnected(self.namespace)
			raise ConnectionRefusedError("membership_required")
		policies.require_visible(await self.repo.get_group(group_uuid), is_member=True)
		self._sessions[sid] = user
		self._groups[sid] = str(group_uuid)
		await self.enter_room(sid, self.room_name(str(group_uuid)))
		await self.emit("group:ready", {"group_id": str(group_uuid)}, room=sid)

	async def on_disconnect(self, sid: str) -> None:
		obs_metrics.socket_disconnected(self.namespace)
		group_id = self._groups.pop(sid, None)
		if group_id:
			await self.leave_room(sid, self.room_name(group_id))
		self._sessions.pop(sid, None)

	@staticmethod
	def room_name(group_id: str) -> str:
		return f"group:{group_id}"
