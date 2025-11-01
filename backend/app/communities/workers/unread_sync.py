"""Worker that reconciles unread notification counters."""

from __future__ import annotations

import asyncio
import logging
from datetime import datetime, timezone

from app.communities.domain import repo as repo_module
from app.obs import metrics as obs_metrics

_LOG = logging.getLogger(__name__)
_JOB_NAME = "communities-unread-sync"


class UnreadSyncWorker:
	"""Periodic job that resyncs unread_counter from notification_entity."""

	def __init__(
		self,
		*,
		repository: repo_module.CommunitiesRepository | None = None,
		interval_seconds: float = 60.0,
	) -> None:
		self.repo = repository or repo_module.CommunitiesRepository()
		self.interval_seconds = interval_seconds
		self._running = False

	async def run_forever(self) -> None:
		self._running = True
		while self._running:
			started = datetime.now(timezone.utc)
			try:
				updated = await self.process_once()
				duration = (datetime.now(timezone.utc) - started).total_seconds()
				obs_metrics.record_job_run(_JOB_NAME, result="success", duration_seconds=duration)
				sleep_for = self.interval_seconds if updated == 0 else max(self.interval_seconds / 2, 1.0)
			except Exception:  # pragma: no cover - defensive logging
				obs_metrics.record_job_run(_JOB_NAME, result="error")
				_LOG.exception("unread_sync.run_failed")
				sleep_for = self.interval_seconds
			await asyncio.sleep(sleep_for)

	def stop(self) -> None:
		self._running = False

	async def process_once(self) -> int:
		"""Rebuild unread counters; returns number of rows touched."""
		return await self.repo.rebuild_unread_counters()


__all__ = ["UnreadSyncWorker"]
