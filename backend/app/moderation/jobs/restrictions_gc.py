"""Garbage collect expired restrictions from the ledger."""

from __future__ import annotations

from datetime import datetime, timezone
from typing import Iterable

from app.moderation.domain.restrictions import RestrictionService


async def run(
    service: RestrictionService,
    *,
    user_ids: Iterable[str],
    now: datetime | None = None,
) -> int:
    """Remove expired restrictions from storage."""

    now = now or datetime.now(timezone.utc)
    removed = 0
    for user_id in user_ids:
        for item in await service.list_all(user_id, include_inactive=True):
            if item.expires_at and item.expires_at <= now:
                await service.revoke(item.id)
                removed += 1
    return removed
