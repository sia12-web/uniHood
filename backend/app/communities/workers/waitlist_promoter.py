"""Background worker to promote event waitlists when capacity frees up."""

from __future__ import annotations

import asyncio
import logging

from app.communities.domain import repo as repo_module
from app.communities.domain.rsvp_service import RSVPService

_LOG = logging.getLogger(__name__)


class WaitlistPromoter:
	"""Promotes waitlisted RSVPs into available seats."""

	def __init__(
		self,
		*,
		repository: repo_module.CommunitiesRepository | None = None,
		rsvp_service: RSVPService | None = None,
		batch_size: int = 10,
		poll_interval: float = 15.0,
	) -> None:
		self.repo = repository or repo_module.CommunitiesRepository()
		self.rsvp_service = rsvp_service or RSVPService(self.repo)
		self.batch_size = batch_size
		self.poll_interval = poll_interval
		self._running = False

	async def run_forever(self) -> None:
		self._running = True
		while self._running:
			promoted = await self.process_once()
			if promoted == 0:
				await asyncio.sleep(self.poll_interval)

	def stop(self) -> None:
		self._running = False

	async def process_once(self) -> int:
		event_ids = await self.repo.list_events_waitlist_candidates(limit=self.batch_size)
		total_promoted = 0
		for event_id in event_ids:
			try:
				promotions = await self.rsvp_service.promote_waitlist(event_id)
			except Exception:  # pragma: no cover - defensive logging
				_LOG.exception("waitlist_promoter.failed", extra={"event_id": str(event_id)})
				continue
			total_promoted += len(promotions)
		return total_promoted


__all__ = ["WaitlistPromoter"]
