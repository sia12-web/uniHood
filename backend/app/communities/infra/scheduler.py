"""APScheduler wrapper for communities feed jobs."""

from __future__ import annotations

from typing import Callable

from apscheduler.schedulers.asyncio import AsyncIOScheduler
from apscheduler.triggers.interval import IntervalTrigger


class FeedScheduler:
    """Minimal wrapper around AsyncIOScheduler for feed jobs."""

    def __init__(self) -> None:
        self._scheduler = AsyncIOScheduler(timezone="UTC")
        self._started = False

    def start(self) -> None:
        if not self._started:
            self._scheduler.start()
            self._started = True

    def shutdown(self) -> None:
        if self._started:
            self._scheduler.shutdown(wait=False)
            self._started = False

    def schedule_hourly(self, job_id: str, func: Callable[[], object], *, hours: int = 1) -> None:
        trigger = IntervalTrigger(hours=hours)
        self._scheduler.add_job(func, trigger=trigger, id=job_id, replace_existing=True)


__all__ = ["FeedScheduler"]
