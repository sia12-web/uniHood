"""Outbox indexing worker for communities."""

from __future__ import annotations

import asyncio
import logging
from typing import Awaitable, Callable, Iterable, Sequence

from app.communities.domain import models, repo as repo_module
from app.communities.infra import opensearch
from app.infra.postgres import get_pool

_LOG = logging.getLogger(__name__)

BulkIndexCallable = Callable[[Iterable[dict]], Awaitable[None]]

_INDEX_BY_AGGREGATE = {
	"group": "communities-groups-v1",
	"post": "communities-posts-v1",
	"event": "communities-events-v1",
}
_DEFAULT_INDEX = "communities-groups-v1"
_PIPELINE = "communities-generic-v1"


class OutboxIndexer:
	"""Periodically reads the communities outbox and indexes payloads."""

	def __init__(
		self,
		*,
		repository: repo_module.CommunitiesRepository | None = None,
		batch_size: int = 100,
		poll_interval: float = 1.0,
		bulk_handler: BulkIndexCallable | None = None,
	) -> None:
		self.repo = repository or repo_module.CommunitiesRepository()
		self.batch_size = batch_size
		self.poll_interval = poll_interval
		self._bulk = bulk_handler or opensearch.bulk_index
		self._running = False

	async def run_forever(self) -> None:
		"""Continuously process the outbox until :meth:`stop` is called."""
		self._running = True
		while self._running:
			processed = await self.process_once()
			if processed == 0:
				await asyncio.sleep(self.poll_interval)

	def stop(self) -> None:
		"""Request the worker to stop after the current iteration."""
		self._running = False

	async def process_once(self) -> int:
		"""Process at most one batch from the outbox.

		Returns the number of events successfully indexed.
		"""
		pool = await get_pool()
		async with pool.acquire() as conn:
			events = await self.repo.fetch_outbox_batch(limit=self.batch_size, conn=conn)
			if not events:
				return 0
			try:
				await self._bulk(self._format_batch(events))
			except Exception:  # pragma: no cover - logging safeguard
				_LOG.exception("outbox_indexer.bulk_failed", extra={"count": len(events)})
				raise
			await self.repo.mark_outbox_processed(ids=[event.id for event in events], conn=conn)
			return len(events)

	def _format_batch(self, events: Sequence[models.OutboxEvent]) -> Iterable[dict]:
		for event in events:
			index_name = _INDEX_BY_AGGREGATE.get(event.aggregate_type, _DEFAULT_INDEX)
			doc = dict(event.payload or {})
			doc.setdefault("id", str(event.aggregate_id))
			doc.setdefault("deleted", False)
			doc.update(
				{
					"aggregate_type": event.aggregate_type,
					"aggregate_id": str(event.aggregate_id),
					"event_type": event.event_type,
					"outbox_id": event.id,
					"created_at": event.created_at.isoformat(),
				}
			)
			yield {
				"index": index_name,
				"pipeline": _PIPELINE,
				"document": doc,
			}


__all__ = ["OutboxIndexer"]
