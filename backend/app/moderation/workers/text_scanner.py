"""Worker that processes text safety scan jobs."""

from __future__ import annotations

import html
import json
import logging
import re
import time
from dataclasses import dataclass
from typing import Any, Mapping, Protocol

from app.moderation.domain.safety_repository import SafetyRepository
from app.moderation.domain.thresholds import ModerationThresholds, ThresholdDecision
from app.obs import metrics

logger = logging.getLogger(__name__)

_NORMALIZE_RE = re.compile(r"[^a-z0-9\s]+", re.IGNORECASE)
_WHITESPACE_RE = re.compile(r"\s+")


class RedisStreams(Protocol):
    async def xread(self, streams: Mapping[str, str], count: int, block: int) -> list[tuple[str, list[tuple[str, Mapping[bytes, bytes]]]]]:
        ...

    async def xadd(self, stream: str, fields: Mapping[str, Any]) -> str:
        ...


class TextSafetyModel(Protocol):
    async def score(self, text: str) -> Mapping[str, float]:
        ...


class NullTextSafetyModel(TextSafetyModel):
    async def score(self, text: str) -> Mapping[str, float]:  # noqa: D401
        return {"toxicity": 0.0, "harassment": 0.0, "hate": 0.0, "selfharm": 0.0, "sexual": 0.0}


@dataclass(slots=True)
class TextScannerWorker:
    """Consumes text scan jobs, stores scores, and emits moderation signals."""

    redis: RedisStreams
    repository: SafetyRepository
    model: TextSafetyModel
    thresholds: ModerationThresholds
    ingress_stream: str = "scan:ingress"
    results_stream: str = "scan:results"
    batch_size: int = 100
    block_ms: int = 5000
    last_id: str = "0-0"

    async def run_once(self) -> None:
        messages = await self.redis.xread({self.ingress_stream: self.last_id}, count=self.batch_size, block=self.block_ms)
        if not messages:
            return
        for _stream, entries in messages:
            for entry_id, payload in entries:
                event = _decode(payload)
                if event.get("type") != "text":
                    continue
                await self._process_event(entry_id, event)
            self.last_id = entries[-1][0]

    async def _process_event(self, entry_id: str, event: Mapping[str, Any]) -> None:
        start = time.perf_counter()
        status = "error"
        try:
            subject_type = str(event.get("subject_type"))
            subject_id = str(event.get("subject_id"))
            text = str(event.get("text", ""))
            normalized = _normalize_text(text)
            scores = await self.model.score(normalized)
            decision = self.thresholds.evaluate_text(scores, surface=event.get("surface"))
            await self.repository.upsert_text_scan(
                subject_type=subject_type,
                subject_id=subject_id,
                lang=event.get("lang"),
                scores=scores,
                ocr=event.get("ocr") == "1",
            )
            await self._emit_results(entry_id, event, scores, decision)
            status = decision.status
        except Exception as exc:  # pragma: no cover - defensive guard
            status = "error"
            metrics.SCAN_FAILURES_TOTAL.labels("text", exc.__class__.__name__).inc()
            logger.exception("text scan failed: entry_id=%s", entry_id)
        finally:
            duration = time.perf_counter() - start
            metrics.SCAN_LATENCY_SECONDS.labels("text").observe(duration)
            metrics.SCAN_JOBS_TOTAL.labels("text", status).inc()

    async def _emit_results(
        self,
        entry_id: str,
        event: Mapping[str, Any],
        scores: Mapping[str, float],
    decision: ThresholdDecision,
    ) -> None:
        signals = {
            "scores": scores,
            "status": decision.status,
            "level": decision.level,
            "type": "text",
        }
        payload = {
            "event_id": entry_id,
            "subject_type": event.get("subject_type"),
            "subject_id": event.get("subject_id"),
            "signals": json.dumps(signals),
            "suggested_action": decision.suggested_action,
            "source": "text",
            "status": decision.status,
        }
        await self.redis.xadd(self.results_stream, payload)


def _normalize_text(value: str) -> str:
    unfolded = html.unescape(value or "")
    lowered = unfolded.lower()
    collapsed = _WHITESPACE_RE.sub(" ", _NORMALIZE_RE.sub(" ", lowered))
    return collapsed.strip()


def _decode(payload: Mapping[bytes, bytes]) -> Mapping[str, Any]:
    decoded: dict[str, Any] = {}
    for key, value in payload.items():
        decoded_key = key.decode("utf-8") if isinstance(key, bytes) else str(key)
        decoded_value = value.decode("utf-8") if isinstance(value, bytes) else value
        decoded[decoded_key] = decoded_value
    return decoded
