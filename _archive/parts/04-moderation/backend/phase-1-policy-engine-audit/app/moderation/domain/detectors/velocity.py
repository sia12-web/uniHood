"""Velocity detector tracking per-user submission rate."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Protocol


class RateCounter(Protocol):
    """Protocol describing the rate limiting backend."""

    async def increment(self, key: str, ttl_seconds: int) -> int:
        ...


@dataclass
class VelocityDetector:
    """Flags users who exceed content velocity thresholds."""

    counter: RateCounter

    async def evaluate(self, user_id: str, subject_type: str, trust_score: int) -> bool:
        ttl = 60
        key = f"vel:{user_id}:{subject_type}"
        hits = await self.counter.increment(key, ttl)
        limit = self._threshold_for(trust_score, subject_type)
        return hits > limit

    def _threshold_for(self, trust_score: int, subject_type: str) -> int:
        base = 5 if subject_type == "post" else 12
        if trust_score >= 70:
            return base * 2
        if trust_score <= 20:
            return max(1, base // 2)
        return base
