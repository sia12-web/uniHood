"""Worker that persists notifications and fans out to outbound queues."""

from __future__ import annotations

import asyncio
import json
import logging
from typing import Dict
from uuid import UUID

from app.communities.domain.notifications_service import NotificationService
from app.communities.infra import redis_streams
from app.communities.sockets import server as socket_server
from app.infra.redis import redis_client
from app.obs import metrics as obs_metrics

_LOG = logging.getLogger(__name__)


class NotificationBuilder:
	"""Builds notifications from Redis stream tasks."""

	def __init__(
		self,
		*,
		service: NotificationService | None = None,
		poll_interval: float = 0.5,
		batch_size: int = 100,
	) -> None:
		self.service = service or NotificationService()
		self.poll_interval = poll_interval
		self.batch_size = batch_size
		self._running = False
		self._last_id = "0-0"

	async def run_forever(self) -> None:
		self._running = True
		while self._running:
			processed = await self.process_once()
			if processed == 0:
				await asyncio.sleep(self.poll_interval)

	def stop(self) -> None:
		self._running = False

	async def process_once(self) -> int:
		messages = await redis_client.xread(
			streams={redis_streams.STREAM_NOTIFICATION_BUILD: self._last_id},
			count=self.batch_size,
			block=1000,
		)
		if not messages:
			return 0
		processed = 0
		for stream_name, entries in messages:
			for entry_id, payload in entries:
				await self._handle(dict(payload))
				self._last_id = entry_id
				processed += 1
		return processed

	async def _handle(self, payload: Dict[str, str]) -> None:
		try:
			actor_id = payload.get("actor_id")
			ref_id_raw = payload.get("ref_id")
			type_name = payload.get("type")
			user_ids_raw = payload.get("user_ids") or ""
			group_id = payload.get("group_id")
			data_raw = payload.get("data")
			if not actor_id or not ref_id_raw or not type_name:
				return
			ref_id = UUID(ref_id_raw)
			actor_uuid = UUID(actor_id)
			if data_raw:
				try:
					data = json.loads(data_raw)
				except json.JSONDecodeError:
					data = {"raw": data_raw}
			else:
				data = {}
			recipients = [UUID(item) for item in user_ids_raw.split(",") if item]
			for recipient in recipients:
				if recipient == actor_uuid:
					continue
				entity, created = await self.service.persist_notification(
					user_id=recipient,
					type=type_name,
					ref_id=ref_id,
					actor_id=actor_uuid,
					payload={"group_id": group_id, **data},
				)
				if created and entity is not None:
					await socket_server.emit_user(str(recipient), "notification.new", {
						"notification": self.service.to_response(entity).model_dump(mode="json"),
					})
					await redis_client.xadd(
						redis_streams.STREAM_NOTIFICATION_OUTBOUND,
						{
							"user_id": str(recipient),
							"notification_id": str(entity.id),
							"type": type_name,
						},
					)
					obs_metrics.comm_notification_outbound("outbound")
		except Exception:  # pragma: no cover
			_LOG.exception("notification_builder.handle_failed", extra={"payload": payload})