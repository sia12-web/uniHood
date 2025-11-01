"""Background job that applies reputation decay."""

from __future__ import annotations

from datetime import datetime, timezone

from app.moderation.domain.reputation import ReputationService


async def run(service: ReputationService, *, now: datetime | None = None) -> int:
    """Run a single decay sweep and return the number of users updated."""

    now = now or datetime.now(timezone.utc)
    updated = await service.run_decay_pass(now=now)
    return len(updated)
