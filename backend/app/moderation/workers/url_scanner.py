"""Worker that resolves URLs and classifies their safety."""

from __future__ import annotations

import json
import logging
import time
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from typing import Any, Mapping, Protocol

from app.moderation.domain.safety_repository import SafetyRepository
from app.moderation.domain.thresholds import ModerationThresholds, ThresholdDecision
from app.moderation.domain.url_reputation import UrlReputationClient, UrlVerdict
from app.obs import metrics

logger = logging.getLogger(__name__)


class RedisStreams(Protocol):
    async def xread(self, streams: Mapping[str, str], count: int, block: int) -> list[tuple[str, list[tuple[str, Mapping[bytes, bytes]]]]]:
        ...

    async def xadd(self, stream: str, fields: Mapping[str, Any]) -> str:
        ...


@dataclass(slots=True)
class UrlScannerWorker:
    """Consumes URL scan jobs and emits normalized verdicts."""

    redis: RedisStreams
    repository: SafetyRepository
    client: UrlReputationClient
    thresholds: ModerationThresholds
    ingress_stream: str = "scan:ingress"
    results_stream: str = "scan:results"
    batch_size: int = 100
    block_ms: int = 5000
    last_id: str = "0-0"
    cache_ttl: timedelta = timedelta(hours=24)

    async def run_once(self) -> None:
        messages = await self.redis.xread({self.ingress_stream: self.last_id}, count=self.batch_size, block=self.block_ms)
        if not messages:
            return
        for _stream, entries in messages:
            for entry_id, payload in entries:
                event = _decode(payload)
                if event.get("type") != "url":
                    continue
                await self._process_event(entry_id, event)
            self.last_id = entries[-1][0]

    async def _process_event(self, entry_id: str, event: Mapping[str, Any]) -> None:
        start = time.perf_counter()
        status = "error"
        try:
            url = str(event.get("url"))
            cached = await self.repository.get_recent_url_scan(url)
            verdict: UrlVerdict
            if cached and self._is_fresh(cached.created_at):
                verdict = UrlVerdict(
                    requested_url=cached.url,
                    final_url=cached.final_url,
                    etld_plus_one=cached.etld_plus_one,
                    verdict=cached.verdict,
                    lists=list(cached.details.get("lists", [])) if isinstance(cached.details.get("lists"), list) else [],
                    details={key: str(value) for key, value in cached.details.items()},
                    resolved_at=cached.created_at,
                )
            else:
                verdict = await self.client.classify(url)
                details = dict(verdict.details)
                if verdict.lists:
                    details.setdefault("lists", verdict.lists)
                await self.repository.upsert_url_scan(
                    url=verdict.requested_url,
                    final_url=verdict.final_url,
                    etld_plus_one=verdict.etld_plus_one,
                    verdict=verdict.verdict,
                    details=details,
                )
            decision = self.thresholds.evaluate_url(verdict.verdict)
            await self._emit_results(entry_id, event, verdict, decision)
            status = decision.status
            metrics.URL_VERDICT_TOTAL.labels(verdict.verdict).inc()
        except Exception as exc:  # pragma: no cover - defensive guard
            status = "error"
            metrics.SCAN_FAILURES_TOTAL.labels("url", exc.__class__.__name__).inc()
            logger.exception("url scan failed: entry_id=%s", entry_id)
        finally:
            duration = time.perf_counter() - start
            metrics.SCAN_LATENCY_SECONDS.labels("url").observe(duration)
            metrics.SCAN_JOBS_TOTAL.labels("url", status).inc()

    async def _emit_results(
        self,
        entry_id: str,
        event: Mapping[str, Any],
        verdict: UrlVerdict,
        decision: ThresholdDecision,
    ) -> None:
        signals = {
            "verdict": verdict.verdict,
            "final_url": verdict.final_url,
            "etld_plus_one": verdict.etld_plus_one,
            "lists": verdict.lists,
            "details": verdict.details,
            "status": decision.status,
            "type": "url",
        }
        payload = {
            "event_id": entry_id,
            "subject_type": event.get("subject_type"),
            "subject_id": event.get("subject_id"),
            "signals": json.dumps(signals),
            "suggested_action": decision.suggested_action,
            "source": "url",
            "status": decision.status,
        }
        await self.redis.xadd(self.results_stream, payload)

    def _is_fresh(self, created_at: datetime) -> bool:
        now = datetime.now(timezone.utc)
        return now - created_at <= self.cache_ttl


def _decode(payload: Mapping[bytes, bytes]) -> Mapping[str, Any]:
    decoded: dict[str, Any] = {}
    for key, value in payload.items():
        decoded_key = key.decode("utf-8") if isinstance(key, bytes) else str(key)
        decoded_value = value.decode("utf-8") if isinstance(value, bytes) else value
        decoded[decoded_key] = decoded_value
    return decoded
