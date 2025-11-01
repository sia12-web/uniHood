"""Trust score utilities for moderation."""

from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Protocol


class TrustRepository(Protocol):
    """Storage contract for trust scores."""

    async def get_score(self, user_id: str) -> int | None:
        ...

    async def upsert_score(self, user_id: str, score: int, event_at: datetime) -> None:
        ...


@dataclass
class TrustLedger:
    """Applies positive/negative trust score adjustments with bounding."""

    repository: TrustRepository
    min_score: int = 0
    max_score: int = 100

    async def adjust(self, user_id: str, delta: int) -> int:
        current = await self.repository.get_score(user_id) or 50
        updated = max(self.min_score, min(self.max_score, current + delta))
        await self.repository.upsert_score(user_id, updated, datetime.now(timezone.utc))
        return updated

    async def hydrate(self, user_id: str) -> int:
        score = await self.repository.get_score(user_id)
        if score is None:
            await self.repository.upsert_score(user_id, 50, datetime.now(timezone.utc))
            return 50
        return score
