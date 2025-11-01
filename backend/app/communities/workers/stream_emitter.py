"""Redis stream fan-out worker for communities events."""

from __future__ import annotations

import asyncio
import logging
from typing import Awaitable, Callable, Dict

from app.communities.infra.redis_streams import STREAM_COMMENT, STREAM_EVENT, STREAM_POST, STREAM_RSVP
from app.infra.redis import redis_client

_LOG = logging.getLogger(__name__)

StreamHandler = Callable[[str, str, dict[str, str]], Awaitable[None]]


class StreamEmitter:
	"""Continuously consumes Redis streams and dispatches events."""

	def __init__(
		self,
		*,
		handler: StreamHandler | None = None,
		poll_interval: float = 1.0,
		batch_size: int = 100,
	) -> None:
		self._handler = handler or self._default_handler
		self.poll_interval = poll_interval
		self.batch_size = batch_size
		self._last_ids: Dict[str, str] = {
			STREAM_POST: "0-0",
			STREAM_COMMENT: "0-0",
			STREAM_EVENT: "0-0",
			STREAM_RSVP: "0-0",
		}
		self._running = False

	async def run_forever(self) -> None:
		"""Continuously poll streams until :meth:`stop` is called."""
		self._running = True
		while self._running:
			processed = await self.process_once()
			if processed == 0:
				await asyncio.sleep(self.poll_interval)

	def stop(self) -> None:
		"""Request the worker to stop after the current poll."""
		self._running = False

	async def process_once(self) -> int:
		streams = dict(self._last_ids)
		messages = await redis_client.xread(streams=streams, count=self.batch_size)
		if not messages:
			return 0
		processed = 0
		for stream_name, entries in messages:
			for entry_id, payload in entries:
				await self._dispatch(stream_name, entry_id, dict(payload))
				self._last_ids[stream_name] = entry_id
				processed += 1
		return processed

	async def _dispatch(self, stream: str, entry_id: str, payload: dict[str, str]) -> None:
		try:
			await self._handler(stream, entry_id, payload)
		except Exception:  # pragma: no cover - defensive logging
			_LOG.exception("stream_emitter.handler_failed", extra={"stream": stream, "entry_id": entry_id})

	@staticmethod
	async def _default_handler(stream: str, entry_id: str, payload: dict[str, str]) -> None:
		_LOG.info("stream_emitter.event", extra={"stream": stream, "entry_id": entry_id, "payload": payload})


__all__ = ["StreamEmitter"]
