"""Periodic rank updater for feed entries."""

from __future__ import annotations

import asyncio
import logging
import time

from app.communities.domain import repo as repo_module
from app.communities.services.feed_writer import FeedWriter
from app.obs import metrics as obs_metrics

_LOG = logging.getLogger(__name__)


class RankUpdater:
    """Recomputes rank scores for recent posts at a fixed interval."""

    def __init__(
        self,
        *,
        repository: repo_module.CommunitiesRepository | None = None,
        writer: FeedWriter | None = None,
        interval_seconds: int = 3600,
        window_hours: int = 24,
    ) -> None:
        self.repo = repository or repo_module.CommunitiesRepository()
        self.writer = writer or FeedWriter(repository=self.repo)
        self.interval_seconds = interval_seconds
        self.window_hours = window_hours
        self._running = False

    async def run_forever(self) -> None:
        self._running = True
        while self._running:
            try:
                await self.run_once()
            except Exception:  # pragma: no cover - defensive
                _LOG.exception("rank_updater.run_once_failed")
            await asyncio.sleep(self.interval_seconds)

    def stop(self) -> None:
        self._running = False

    async def run_once(self) -> int:
        start = time.perf_counter()
        posts = await self.repo.list_recent_posts(hours=self.window_hours)
        for post in posts:
            await self.writer.rescore_post(post)
        duration = time.perf_counter() - start
        obs_metrics.FEED_RANK_RECOMPUTE_DURATION.observe(duration)
        _LOG.debug(
            "rank_updater.recompute",
            extra={"count": len(posts), "duration": duration},
        )
        return len(posts)


__all__ = ["RankUpdater"]
