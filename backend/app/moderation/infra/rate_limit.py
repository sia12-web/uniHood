"""Rate limiting utilities for moderation gates."""

from __future__ import annotations

from dataclasses import dataclass

from app.moderation.infra.redis import RedisStreamClient


@dataclass
class RedisRateLimiter:
    """Simple counter based rate limiter backed by Redis."""

    redis: RedisStreamClient
    ttl_seconds: int = 60

    async def hit(self, user_id: str, subject_type: str) -> int:
        key = f"rl:{user_id}:{subject_type}"
        try:
            return await self.redis.set_with_ttl(key, self.ttl_seconds)
        except Exception:
            return -1
