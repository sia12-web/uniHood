"""Job runner to refresh IP reputation labels."""

from __future__ import annotations

from datetime import datetime, timedelta, timezone

from app.moderation.domain.ip_enrichment import IpEnrichmentService


async def run(
    service: IpEnrichmentService,
    *,
    stale_hours: int = 24,
    now: datetime | None = None,
) -> int:
    """Refresh all IPs whose metadata predates the staleness horizon."""

    now = now or datetime.now(timezone.utc)
    before = now - timedelta(hours=stale_hours)
    refreshed = await service.refresh_stale(before=before)
    return len(refreshed)
