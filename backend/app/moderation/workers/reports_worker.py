"""Worker that aggregates report metrics from Redis streams."""

from __future__ import annotations

import logging
from dataclasses import dataclass
from typing import Any, Mapping, Protocol

from app.obs import metrics as obs_metrics

logger = logging.getLogger(__name__)


class RedisStream(Protocol):
    async def xread(
        self,
        streams: Mapping[str, str],
        count: int,
        block: int,
    ) -> list[tuple[str, list[tuple[str, Mapping[bytes, bytes]]]]]:
        ...


class ReporterMetricsRepository(Protocol):
    async def increment_reports(self, reporter_id: str) -> int:
        ...


@dataclass
class ReportsWorker:
    """Consumes moderation report events and updates aggregates."""

    redis: RedisStream
    repository: ReporterMetricsRepository
    stream_key: str = "mod:reports"
    batch_size: int = 100
    block_ms: int = 5000
    last_id: str = "0-0"

    async def run_once(self) -> None:
        messages = await self.redis.xread({self.stream_key: self.last_id}, count=self.batch_size, block=self.block_ms)
        if not messages:
            return
        for _stream, entries in messages:
            for entry_id, payload in entries:
                event = _decode(payload)
                await self._process_event(event)
            self.last_id = entries[-1][0]

    async def _process_event(self, event: Mapping[str, Any]) -> None:
        reporter_id = str(event.get("reporter_id", ""))
        reason = str(event.get("reason_code", "unknown")) or "unknown"
        try:
            await self.repository.increment_reports(reporter_id)
        except Exception:  # noqa: BLE001 - metrics should not halt ingestion
            logger.exception("failed to increment reporter metrics", extra={"reporter_id": reporter_id})
        obs_metrics.MOD_REPORTS_TOTAL.labels(reason=reason).inc()


def _decode(payload: Mapping[bytes, bytes]) -> Mapping[str, Any]:
    result: dict[str, Any] = {}
    for key, value in payload.items():
        decoded_key = key.decode("utf-8") if isinstance(key, (bytes, bytearray)) else str(key)
        decoded_value: Any
        if isinstance(value, (bytes, bytearray)):
            decoded_value = value.decode("utf-8")
        else:
            decoded_value = value
        result[decoded_key] = decoded_value
    return result
