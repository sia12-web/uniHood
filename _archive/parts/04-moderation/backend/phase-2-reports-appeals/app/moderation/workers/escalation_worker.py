"""Placeholder for the Phase 2 escalation worker."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Iterable, Mapping, Protocol


class RedisStream(Protocol):
    async def xadd(self, stream: str, fields: Mapping[str, Any]) -> str:
        ...


class CaseRepository(Protocol):
    async def list_escalated_cases(self, *, min_severity: int) -> Iterable[Mapping[str, Any]]:
        ...


@dataclass
class EscalationWorker:
    repository: CaseRepository
    redis: RedisStream
    stream_key: str = "mod:escalations"
    severity_threshold: int = 4

    async def run_once(self) -> None:
        """Push escalation alerts for severe cases (Phase 2 placeholder)."""

        raise NotImplementedError("Phase 2 scaffold – implement escalation fan-out")
