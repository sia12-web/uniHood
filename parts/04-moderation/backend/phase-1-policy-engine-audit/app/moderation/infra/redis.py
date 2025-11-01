"""Redis helpers for moderation services."""

from __future__ import annotations

from typing import Any, Mapping

from redis.asyncio import Redis


class RedisStreamClient:
    """Thin wrapper around Redis stream commands."""

    def __init__(self, client: Redis) -> None:
        self.client = client

    async def xread(self, streams: Mapping[str, str], count: int, block: int) -> list[tuple[str, list[tuple[str, Mapping[bytes, bytes]]]]]:
        return await self.client.xread(streams=streams, count=count, block=block)

    async def xadd(self, stream: str, fields: Mapping[str, Any]) -> str:
        return await self.client.xadd(stream, fields)

    async def add_rolling(self, key: str, value: str, ttl_seconds: int) -> None:
        async with self.client.pipeline(transaction=False) as pipe:
            pipe.sadd(key, value)
            pipe.expire(key, ttl_seconds)
            await pipe.execute()

    async def set_with_ttl(self, key: str, ttl_seconds: int) -> int:
        async with self.client.pipeline(transaction=False) as pipe:
            pipe.incr(key, 1)
            pipe.expire(key, ttl_seconds)
            results = await pipe.execute()
        return int(results[0])


class RedisRollingStore:
    """Implements the duplicate detector store contract using Redis sets."""

    def __init__(self, client: Redis) -> None:
        self.client = client

    async def add(self, key: str, value: str, ttl_seconds: int) -> None:
        async with self.client.pipeline(transaction=False) as pipe:
            pipe.sadd(key, value)
            pipe.expire(key, ttl_seconds)
            await pipe.execute()

    async def count(self, key: str) -> int:
        return int(await self.client.scard(key))


class RedisRateCounter:
    """Implements the velocity counter contract using Redis incr + expire."""

    def __init__(self, client: Redis) -> None:
        self.client = client

    async def increment(self, key: str, ttl_seconds: int) -> int:
        async with self.client.pipeline(transaction=False) as pipe:
            pipe.incr(key, 1)
            pipe.expire(key, ttl_seconds)
            results = await pipe.execute()
        return int(results[0])
