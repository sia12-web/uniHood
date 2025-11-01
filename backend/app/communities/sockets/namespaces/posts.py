"""Socket.IO namespace for post-centric realtime updates."""

from __future__ import annotations

from typing import Dict
from urllib.parse import parse_qs

from uuid import UUID

from app.communities.domain import repo as repo_module
from app.communities.sockets.namespaces.base import BaseCommunitiesNamespace
from app.obs import metrics as obs_metrics


class PostNamespace(BaseCommunitiesNamespace):
	"""Clients join a per-post room for comment/reaction updates."""

	def __init__(self, *, repository: repo_module.CommunitiesRepository | None = None) -> None:
		super().__init__("/posts")
		self.repo = repository or repo_module.CommunitiesRepository()
		self._posts: Dict[str, str] = {}

	async def on_connect(self, sid: str, environ: dict) -> None:
		obs_metrics.socket_connected(self.namespace)
		user = self._resolve_user(environ)
		scope = environ.get("asgi.scope", environ)
		auth_payload = environ.get("auth") or scope.get("auth") or {}
		params = parse_qs(scope.get("query_string", b"").decode())
		post_id_raw = auth_payload.get("postId") or (params.get("postId") or [None])[0]
		if not post_id_raw:
			obs_metrics.socket_disconnected(self.namespace)
			raise ConnectionRefusedError("missing post id")
		try:
			post_id = UUID(post_id_raw)
		except ValueError as exc:
			obs_metrics.socket_disconnected(self.namespace)
			raise ConnectionRefusedError("invalid post id") from exc
		post = await self.repo.get_post(post_id)
		if not post or post.deleted_at is not None:
			obs_metrics.socket_disconnected(self.namespace)
			raise ConnectionRefusedError("post_not_found")
		membership = await self.repo.get_member(post.group_id, UUID(user.id))
		if membership is None or membership.is_banned:
			obs_metrics.socket_disconnected(self.namespace)
			raise ConnectionRefusedError("membership_required")
		self._sessions[sid] = user
		self._posts[sid] = str(post_id)
		await self.enter_room(sid, self.room_name(str(post_id)))
		await self.emit("post:ready", {"post_id": str(post_id)}, room=sid)

	async def on_disconnect(self, sid: str) -> None:
		obs_metrics.socket_disconnected(self.namespace)
		post_id = self._posts.pop(sid, None)
		if post_id:
			await self.leave_room(sid, self.room_name(post_id))
		self._sessions.pop(sid, None)

	@staticmethod
	def room_name(post_id: str) -> str:
		return f"post:{post_id}"
