"""Redis-backed caching helpers for moderation dashboards."""

from __future__ import annotations

import asyncio
import json
from typing import Any, Awaitable, Callable

from app.infra.redis import RedisProxy, redis_client

CacheBuilder = Callable[[], Awaitable[Any]]


class DashboardCache:
    """Thin wrapper over Redis providing JSON caching with singleflight."""

    def __init__(self, redis: RedisProxy | None = None, *, namespace: str = "mod:dash:") -> None:
        self.redis = redis or redis_client
        self.namespace = namespace
        self._locks: dict[str, asyncio.Lock] = {}

    def _key(self, suffix: str) -> str:
        return f"{self.namespace}{suffix}"

    def _lock(self, suffix: str) -> asyncio.Lock:
        if suffix not in self._locks:
            self._locks[suffix] = asyncio.Lock()
        return self._locks[suffix]

    async def get(self, suffix: str) -> Any | None:
        raw = await self.redis.get(self._key(suffix))
        if not raw:
            return None
        try:
            if isinstance(raw, bytes):
                decoded = raw.decode("utf-8")
            else:
                decoded = str(raw)
            return json.loads(decoded)
        except json.JSONDecodeError:
            return None

    async def set(self, suffix: str, value: Any, *, ttl: int) -> None:
        payload = json.dumps(value).encode("utf-8")
        await self.redis.set(self._key(suffix), payload, ex=ttl)

    async def get_or_build(self, suffix: str, *, ttl: int, builder: CacheBuilder) -> Any:
        cached = await self.get(suffix)
        if cached is not None:
            return cached
        lock = self._lock(suffix)
        async with lock:
            cached = await self.get(suffix)
            if cached is not None:
                return cached
            value = await builder()
            await self.set(suffix, value, ttl=ttl)
            return value
