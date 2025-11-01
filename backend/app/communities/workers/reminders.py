"""Worker that dispatches upcoming event reminders."""

from __future__ import annotations

import asyncio
import logging
from datetime import datetime, timedelta, timezone
from uuid import UUID

from app.communities.domain import repo as repo_module
from app.communities.infra.redis_streams import publish_event_event
from app.infra.postgres import get_pool
from app.infra.redis import redis_client
from app.obs import metrics as obs_metrics

_LOG = logging.getLogger(__name__)

_DEFAULT_OFFSETS_HOURS = (24, 1)
_DEDUPE_TTL_SECONDS = 2 * 60 * 60


class EventReminderWorker:
	"""Scans upcoming events and emits reminder notifications."""

	def __init__(
		self,
		*,
		repository: repo_module.CommunitiesRepository | None = None,
		offsets_hours: tuple[int, ...] = _DEFAULT_OFFSETS_HOURS,
		batch_size: int = 200,
		poll_interval: float = 60.0,
	) -> None:
		self.repo = repository or repo_module.CommunitiesRepository()
		self.offsets_hours = offsets_hours
		self.batch_size = batch_size
		self.poll_interval = poll_interval
		self._running = False

	async def run_forever(self) -> None:
		self._running = True
		while self._running:
			sent = await self.process_once()
			if sent == 0:
				await asyncio.sleep(self.poll_interval)

	def stop(self) -> None:
		self._running = False

	async def process_once(self) -> int:
		now = datetime.now(timezone.utc)
		pool = await get_pool()
		async with pool.acquire() as conn:
			rows = await conn.fetch(
				"""
				SELECT er.user_id, er.event_id, e.group_id, e.start_at
				FROM event_rsvp er
				JOIN event_entity e ON e.id = er.event_id
				WHERE er.status = 'going'
					AND e.deleted_at IS NULL
					AND e.start_at BETWEEN NOW() AND NOW() + INTERVAL '48 hours'
				ORDER BY e.start_at ASC
				LIMIT $1
				""",
				self.batch_size,
			)
		sent_count = 0
		for row in rows:
			user_id = UUID(str(row["user_id"]))
			event_id = UUID(str(row["event_id"]))
			group_id = UUID(str(row["group_id"]))
			start_at = row["start_at"]
			if start_at.tzinfo is None:
				start_at = start_at.replace(tzinfo=timezone.utc)
			for offset in self.offsets_hours:
				scheduled_at = start_at - timedelta(hours=offset)
				if scheduled_at > now:
					obs_metrics.inc_event_reminder_skipped("not_due")
					continue
				key = f"communities:event:reminder:{event_id}:{user_id}:{offset}"
				stored = await redis_client.set(key, "1", ex=_DEDUPE_TTL_SECONDS, nx=True)
				if not stored:
					obs_metrics.inc_event_reminder_skipped("duplicate")
					continue
				await publish_event_event("reminder", event_id=str(event_id), group_id=str(group_id))
				obs_metrics.inc_event_reminder_sent(offset)
				sent_count += 1
		return sent_count


__all__ = ["EventReminderWorker"]
