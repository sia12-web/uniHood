"""Socket.IO namespace for event-specific realtime notifications."""

from __future__ import annotations

from typing import Dict
from urllib.parse import parse_qs

from uuid import UUID

from app.communities.domain import repo as repo_module
from app.communities.sockets.namespaces.base import BaseCommunitiesNamespace
from app.obs import metrics as obs_metrics


class EventNamespace(BaseCommunitiesNamespace):
	"""Allows clients to subscribe to per-event rooms."""

	def __init__(self, *, repository: repo_module.CommunitiesRepository | None = None) -> None:
		super().__init__("/events")
		self.repo = repository or repo_module.CommunitiesRepository()
		self._events: Dict[str, str] = {}

	async def on_connect(self, sid: str, environ: dict) -> None:
		obs_metrics.socket_connected(self.namespace)
		user = self._resolve_user(environ)
		scope = environ.get("asgi.scope", environ)
		auth_payload = environ.get("auth") or scope.get("auth") or {}
		params = parse_qs(scope.get("query_string", b"").decode())
		event_id_raw = auth_payload.get("eventId") or (params.get("eventId") or [None])[0]
		if not event_id_raw:
			obs_metrics.socket_disconnected(self.namespace)
			raise ConnectionRefusedError("missing event id")
		try:
			event_id = UUID(event_id_raw)
		except ValueError as exc:
			obs_metrics.socket_disconnected(self.namespace)
			raise ConnectionRefusedError("invalid event id") from exc
		event = await self.repo.get_event(event_id)
		if not event or event.deleted_at is not None:
			obs_metrics.socket_disconnected(self.namespace)
			raise ConnectionRefusedError("event_not_found")
		membership = await self.repo.get_member(event.group_id, UUID(user.id))
		if membership is None or membership.is_banned:
			obs_metrics.socket_disconnected(self.namespace)
			raise ConnectionRefusedError("membership_required")
		self._sessions[sid] = user
		self._events[sid] = str(event_id)
		await self.enter_room(sid, self.room_name(str(event_id)))
		await self.emit("event:ready", {"event_id": str(event_id)}, room=sid)

	async def on_disconnect(self, sid: str) -> None:
		obs_metrics.socket_disconnected(self.namespace)
		event_id = self._events.pop(sid, None)
		if event_id:
			await self.leave_room(sid, self.room_name(event_id))
		self._sessions.pop(sid, None)

	@staticmethod
	def room_name(event_id: str) -> str:
		return f"event:{event_id}"
