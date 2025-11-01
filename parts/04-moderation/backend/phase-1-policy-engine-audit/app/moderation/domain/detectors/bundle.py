"""Detector bundle wiring for the ingress worker."""

from __future__ import annotations

import time
from dataclasses import dataclass, field
from typing import Any, Dict, Iterable, Optional

from .dup_text import DuplicateTextDetector, RollingStore
from .links import LinkSafetyDetector
from .nsfw_stub import NsfwStubDetector
from .profanity import ProfanityDetector
from .velocity import RateCounter, VelocityDetector
from app.moderation.infra.redis import RedisRateCounter, RedisRollingStore


class InMemoryRollingStore:
    """Rolling store that drops entries after the TTL expires."""

    def __init__(self) -> None:
        self.store: Dict[str, list[tuple[str, float]]] = {}

    async def add(self, key: str, value: str, ttl_seconds: int) -> None:
        expires_at = time.time() + ttl_seconds
        bucket = self.store.setdefault(key, [])
        bucket.append((value, expires_at))
        self._prune(key)

    async def count(self, key: str) -> int:
        self._prune(key)
        return len(self.store.get(key, []))

    def _prune(self, key: str) -> None:
        now = time.time()
        bucket = self.store.get(key, [])
        self.store[key] = [(value, expiry) for value, expiry in bucket if expiry > now]


class InMemoryRateCounter:
    """In-memory counter that respects TTL semantics."""

    def __init__(self) -> None:
        self.store: Dict[str, tuple[int, float]] = {}

    async def increment(self, key: str, ttl_seconds: int) -> int:
        now = time.time()
        value, expiry = self.store.get(key, (0, 0.0))
        if expiry <= now:
            value = 0
        value += 1
        self.store[key] = (value, now + ttl_seconds)
        return value


@dataclass
class DetectorSuite:
    """Aggregates individual detectors into a single evaluate call."""

    profanity: ProfanityDetector = field(default_factory=ProfanityDetector)
    dup_store: RollingStore = field(default_factory=InMemoryRollingStore)
    rate_counter: RateCounter = field(default_factory=InMemoryRateCounter)
    link_safety: LinkSafetyDetector = field(default_factory=LinkSafetyDetector)
    nsfw: NsfwStubDetector = field(default_factory=NsfwStubDetector)

    def __post_init__(self) -> None:
        self.duplicate = DuplicateTextDetector(store=self.dup_store)
        self.velocity = VelocityDetector(counter=self.rate_counter)

    async def evaluate(self, event: Dict[str, Any]) -> Dict[str, Any]:
        text = event.get("text", "")
        actor_id = str(event.get("actor_id", ""))
        subject_type = str(event.get("subject_type", ""))
        trust_score = int(event.get("trust_score", 50))

        results: Dict[str, Any] = {}
        results["profanity"] = self.profanity.evaluate(text)
        results.update(self.link_safety.evaluate(text))
        results["nsfw"] = await self.nsfw.evaluate(event.get("media_keys"))
        results["dup_text_5m"] = await self.duplicate.evaluate(actor_id, text) if actor_id and text else False
        high_velocity = await self.velocity.evaluate(actor_id, subject_type, trust_score) if actor_id else False
        results["high_velocity_posts"] = high_velocity if subject_type == "post" else False
        return results

    @classmethod
    def from_redis(
        cls,
        redis_client,
        *,
        profanity: Optional[ProfanityDetector] = None,
        denylist: Optional[Iterable[str]] = None,
    ) -> "DetectorSuite":
        """Create a detector suite backed by Redis for duplicate and velocity checks."""

        suite = cls(
            profanity=profanity or ProfanityDetector(),
            dup_store=RedisRollingStore(redis_client),
            rate_counter=RedisRateCounter(redis_client),
            link_safety=LinkSafetyDetector(denylist=denylist or []),
            nsfw=NsfwStubDetector(),
        )
        return suite
