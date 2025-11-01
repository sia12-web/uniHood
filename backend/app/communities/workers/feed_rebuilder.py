"""Worker that rebuilds individual user feeds on demand."""

from __future__ import annotations

import asyncio
import logging
from collections import OrderedDict
from typing import Sequence
from uuid import UUID

from app.communities.domain import repo as repo_module
from app.communities.infra import redis as feed_cache
from app.communities.services.feed_writer import FeedWriter

_LOG = logging.getLogger(__name__)


class FeedRebuilder:
    """Consumes rebuild jobs from Redis and refreshes user feeds."""

    def __init__(
        self,
        *,
        repository: repo_module.CommunitiesRepository | None = None,
        writer: FeedWriter | None = None,
        poll_timeout: int = 1,
        max_posts_per_group: int = 500,
    ) -> None:
        self.repo = repository or repo_module.CommunitiesRepository()
        self.writer = writer or FeedWriter(repository=self.repo)
        self.poll_timeout = poll_timeout
        self.max_posts_per_group = max_posts_per_group
        self._running = False

    async def run_forever(self) -> None:
        self._running = True
        while self._running:
            owner_id = await feed_cache.dequeue_rebuild(timeout=self.poll_timeout)
            if owner_id is None:
                await asyncio.sleep(0)
                continue
            try:
                await self._process(owner_id)
            except Exception:  # pragma: no cover - defensive
                _LOG.exception("feed_rebuilder.process_failed", extra={"owner_id": str(owner_id)})

    def stop(self) -> None:
        self._running = False

    async def enqueue(self, owner_id: UUID) -> None:
        await feed_cache.enqueue_rebuild(owner_id)

    async def _process(self, owner_id: UUID) -> None:
        group_ids = await self.repo.list_group_ids_for_user(owner_id)
        posts = await self._collect_posts(group_ids)
        await self.writer.rebuild_feed(owner_id, posts)

    async def _collect_posts(self, group_ids: Sequence[UUID]):
        collected = OrderedDict()
        for group_id in group_ids:
            posts = await self.repo.list_recent_posts_for_group(group_id, limit=self.max_posts_per_group)
            for post in posts:
                collected.setdefault(post.id, post)
        return list(collected.values())


__all__ = ["FeedRebuilder"]
