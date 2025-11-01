"""Redis stream consumer that fans out posts into user feeds."""

from __future__ import annotations

import asyncio
import logging
from typing import Dict
from uuid import UUID

from app.communities.domain import repo as repo_module
from app.communities.infra.redis_streams import STREAM_POST
from app.communities.services.feed_writer import FeedWriter
from app.infra.redis import redis_client

_LOG = logging.getLogger(__name__)


class FanoutWorker:
	"""Consumes post events and updates feed storage."""

	def __init__(
		self,
		*,
		repository: repo_module.CommunitiesRepository | None = None,
		writer: FeedWriter | None = None,
		batch_size: int = 100,
		poll_interval: float = 1.0,
	) -> None:
		self.repo = repository or repo_module.CommunitiesRepository()
		self.writer = writer or FeedWriter(repository=self.repo)
		self.batch_size = batch_size
		self.poll_interval = poll_interval
		self._last_id = "0-0"
		self._running = False

	async def run_forever(self) -> None:
		self._running = True
		while self._running:
			processed = await self.process_once()
			if processed == 0:
				await asyncio.sleep(self.poll_interval)

	def stop(self) -> None:
		self._running = False

	async def process_once(self) -> int:
		streams: Dict[str, str] = {STREAM_POST: self._last_id}
		messages = await redis_client.xread(streams=streams, count=self.batch_size, block=1000)
		if not messages:
			return 0
		processed = 0
		for _stream_name, entries in messages:
			for entry_id, payload in entries:
				await self._handle_event(dict(payload))
				self._last_id = entry_id
				processed += 1
		return processed

	async def _handle_event(self, payload: dict[str, str]) -> None:
		event = payload.get("event")
		if event not in {"created", "deleted"}:
			return
		try:
			post_id = UUID(payload["id"])
		except Exception:  # pragma: no cover - malformed payload
			_LOG.warning("fanout_worker.invalid_payload", extra={"payload": payload})
			return
		if event == "created":
			await self._process_created(post_id)
		elif event == "deleted":
			await self.writer.remove_post(post_id)

	async def _process_created(self, post_id: UUID) -> None:
		post = await self.repo.get_post(post_id)
		if post is None:
			_LOG.debug("fanout_worker.missing_post", extra={"post_id": str(post_id)})
			return
		await self.writer.fanout_post(post)


__all__ = ["FanoutWorker"]
