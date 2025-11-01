"""Ingress worker consumes moderation events and produces decisions."""

from __future__ import annotations

import json
from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Any, Mapping, Protocol

from app.moderation.domain.enforcement import ModerationEnforcer
from app.moderation.domain.policy_engine import Decision, Policy, evaluate_policy
from app.moderation.domain.trust import TrustLedger


class RedisStreams(Protocol):
    async def xread(self, streams: Mapping[str, str], count: int, block: int) -> list[tuple[str, list[tuple[str, Mapping[bytes, bytes]]]]]:
        ...

    async def xadd(self, stream: str, fields: Mapping[str, Any]) -> str:
        ...


class DetectorBundle(Protocol):
    async def evaluate(self, event: Mapping[str, Any]) -> Mapping[str, Any]:
        ...


@dataclass
class IngressWorker:
    """Consumes moderation ingress events and pushes downstream decisions."""

    redis: RedisStreams
    detectors: DetectorBundle
    policy: Policy
    trust: TrustLedger
    enforcer: ModerationEnforcer
    decisions_stream: str = "mod:decisions"
    batch_size: int = 100
    block_ms: int = 5000
    stream_key: str = "mod:ingress"
    last_id: str = "0-0"

    async def run_once(self) -> None:
        messages = await self.redis.xread({self.stream_key: self.last_id}, count=self.batch_size, block=self.block_ms)
        if not messages:
            return
        for _stream, entries in messages:
            for entry_id, payload in entries:
                event = _decode_payload(payload)
                await self._process_event(entry_id, event)
            self.last_id = entries[-1][0]

    async def _process_event(self, entry_id: str, event: Mapping[str, Any]) -> None:
        actor_id = event.get("actor_id")
        trust_score = None
        if actor_id:
            trust_score = await self.trust.hydrate(str(actor_id))
        signals = await self.detectors.evaluate(event)
        decision = evaluate_policy(self.policy, signals, trust_score)
        case, action = await self.enforcer.apply_decision(
            subject_type=str(event.get("subject_type")),
            subject_id=str(event.get("subject_id")),
            actor_id=str(actor_id) if actor_id else None,
            base_reason=str(event.get("reason", "auto_policy")),
            decision=decision,
            policy_id=self.policy.policy_id,
        )
        await self._emit_decision(event, decision, case.case_id, entry_id, action.action)

    async def _emit_decision(
        self,
        event: Mapping[str, Any],
        decision: Decision,
        case_id: str,
        entry_id: str,
        applied_action: str,
    ) -> None:
        payload = {
            "case_id": case_id,
            "decision": decision.action,
            "severity": decision.severity,
            "reasons": json.dumps(decision.reasons),
            "event_id": entry_id,
            "subject_type": event.get("subject_type"),
            "subject_id": event.get("subject_id"),
            "created_at": datetime.now(timezone.utc).isoformat(),
            "applied_action": applied_action,
        }
        await self.redis.xadd(self.decisions_stream, payload)


def _decode_payload(payload: Mapping[Any, Any]) -> Mapping[str, Any]:
    decoded: dict[str, Any] = {}

    def _to_str(value: Any) -> str:
        return value if isinstance(value, str) else value.decode("utf-8")

    for key, value in payload.items():
        decoded[_to_str(key)] = _to_str(value)
    return decoded
