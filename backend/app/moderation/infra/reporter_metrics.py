"""Reporter metrics repository backed by Redis hashes."""

from __future__ import annotations

from dataclasses import dataclass

from redis.asyncio import Redis


@dataclass
class RedisReporterMetricsRepository:
    """Stores per-reporter aggregates used for trust heuristics."""

    client: Redis
    key: str = "mod:reporters:counts"

    async def increment_reports(self, reporter_id: str) -> int:
        if not reporter_id:
            return 0
        value = await self.client.hincrby(self.key, reporter_id, 1)
        return int(value)