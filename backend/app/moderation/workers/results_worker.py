"""Worker that consumes scan results and applies moderation enforcement."""

from __future__ import annotations

import json
import logging
import time
from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Any, Mapping, Protocol

from app.moderation.domain.enforcement import ModerationEnforcer
from app.moderation.domain.policy_engine import Decision
from app.obs import metrics

logger = logging.getLogger(__name__)


class RedisStreams(Protocol):
    async def xread(self, streams: Mapping[str, str], count: int, block: int) -> list[tuple[str, list[tuple[str, Mapping[bytes, bytes]]]]]:
        ...

    async def xadd(self, stream: str, fields: Mapping[str, Any]) -> str:
        ...


@dataclass(slots=True)
class ResultsWorker:
    """Bridges scan results with the moderation enforcement pipeline."""

    redis: RedisStreams
    enforcer: ModerationEnforcer
    stream_key: str = "scan:results"
    decisions_stream: str = "mod:decisions"
    batch_size: int = 100
    block_ms: int = 5000
    last_id: str = "0-0"
    base_reason: str = "safety_scan"

    async def run_once(self) -> None:
        messages = await self.redis.xread({self.stream_key: self.last_id}, count=self.batch_size, block=self.block_ms)
        if not messages:
            return
        for _stream, entries in messages:
            for entry_id, payload in entries:
                body = _decode(payload)
                await self._process_entry(entry_id, body)
            self.last_id = entries[-1][0]

    async def _process_entry(self, entry_id: str, payload: Mapping[str, Any]) -> None:
        start = time.perf_counter()
        action = payload.get("suggested_action", "none")
        status = payload.get("status", "clean")
        try:
            if action == "none":
                metrics.SCAN_JOBS_TOTAL.labels("results", status).inc()
                metrics.SCAN_LATENCY_SECONDS.labels("results").observe(time.perf_counter() - start)
                return
            severity = _severity_for(action)
            signals = _parse_signals(payload.get("signals"))
            decision = Decision(action=action, severity=severity, payload={"signals": signals}, reasons=[self.base_reason])
            case, applied_action = await self.enforcer.apply_decision(
                subject_type=str(payload.get("subject_type")),
                subject_id=str(payload.get("subject_id")),
                actor_id=None,
                base_reason=self.base_reason,
                decision=decision,
                policy_id=None,
            )
            await self._emit_decision(entry_id, payload, case.case_id, applied_action.action, signals)
            metrics.SCAN_JOBS_TOTAL.labels("results", status).inc()
        except Exception as exc:  # pragma: no cover - defensive guard
            metrics.SCAN_FAILURES_TOTAL.labels("results", exc.__class__.__name__).inc()
            logger.exception("failed to apply scan result: entry_id=%s", entry_id)
        finally:
            metrics.SCAN_LATENCY_SECONDS.labels("results").observe(time.perf_counter() - start)

    async def _emit_decision(
        self,
        entry_id: str,
        payload: Mapping[str, Any],
        case_id: str,
        applied_action: str,
        signals: Mapping[str, Any],
    ) -> None:
        body = {
            "case_id": case_id,
            "decision": applied_action,
            "severity": str(_severity_for(applied_action)),
            "reasons": json.dumps([self.base_reason]),
            "event_id": entry_id,
            "subject_type": payload.get("subject_type"),
            "subject_id": payload.get("subject_id"),
            "created_at": datetime.now(timezone.utc).isoformat(),
            "applied_action": applied_action,
            "signals": json.dumps(signals),
        }
        await self.redis.xadd(self.decisions_stream, body)


def _decode(payload: Mapping[Any, Any]) -> Mapping[str, Any]:
    decoded: dict[str, Any] = {}
    for key, value in payload.items():
        k = key.decode("utf-8") if isinstance(key, bytes) else str(key)
        v = value.decode("utf-8") if isinstance(value, bytes) else value
        decoded[k] = v
    return decoded


def _parse_signals(raw: Any) -> Mapping[str, Any]:
    if isinstance(raw, Mapping):
        return raw
    if isinstance(raw, str):
        try:
            data = json.loads(raw)
            if isinstance(data, Mapping):
                return data
        except json.JSONDecodeError:  # pragma: no cover - log and continue
            logger.warning("invalid signals payload: %s", raw)
    return {}


def _severity_for(action: str) -> int:
    match action:
        case "remove":
            return 5
        case "tombstone":
            return 4
        case "warn":
            return 2
        case "restrict_create":
            return 3
        case _:
            return 1
