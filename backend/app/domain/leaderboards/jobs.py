"""Background jobs for computing leaderboards & streaks."""

from __future__ import annotations

from datetime import datetime, timezone
from typing import Optional

from app.domain.leaderboards.service import LeaderboardService

_service = LeaderboardService()


def _current_ymd() -> int:
	now = datetime.now(timezone.utc)
	return now.year * 10000 + now.month * 100 + now.day


async def finalize_daily_leaderboards(*, ymd: Optional[int] = None) -> None:
	"""Entry point for the nightly job that materialises daily leaderboards."""

	await _service.compute_daily_snapshot(ymd=ymd or _current_ymd())


async def refresh_rollups(*, ymd: Optional[int] = None) -> None:
	"""Rebuild weekly/monthly aggregates for the supplied day."""

	await _service.compute_daily_snapshot(ymd=ymd or _current_ymd())
