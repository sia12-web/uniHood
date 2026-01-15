"""Helpers for managing the moderation quarantine queue."""

from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime
from typing import Mapping

from app.moderation.domain.enforcement import ModerationEnforcer
from app.moderation.domain.policy_engine import Decision
from app.moderation.domain.safety_repository import AttachmentSafetyRecord, SafetyRepository
from app.obs import metrics


@dataclass(slots=True)
class QuarantineItem:
    attachment_id: str
    subject_type: str
    subject_id: str
    safety_status: str
    created_at: datetime | None
    scanned_at: datetime | None
    safety_score: Mapping[str, object]

    @staticmethod
    def from_record(record: AttachmentSafetyRecord) -> "QuarantineItem":
        return QuarantineItem(
            attachment_id=record.attachment_id,
            subject_type=record.subject_type,
            subject_id=record.subject_id,
            safety_status=record.safety_status,
            created_at=record.created_at,
            scanned_at=record.scanned_at,
            safety_score=dict(record.safety_score),
        )


@dataclass(slots=True)
class QuarantineManager:
    """Coordinates quarantine listings and moderator resolutions."""

    repository: SafetyRepository
    enforcer: ModerationEnforcer
    reason: str = "quarantine"

    async def list_items(self, *, status: str, after: datetime | None, limit: int) -> list[QuarantineItem]:
        records = await self.repository.list_quarantine_items(status=status, after=after, limit=limit)
        await self._update_metrics(status)
        return [QuarantineItem.from_record(record) for record in records]

    async def resolve(
        self,
        attachment_id: str,
        *,
        verdict: str,
        note: str | None,
        actor_id: str | None,
    ) -> QuarantineItem | None:
        record = await self.repository.resolve_quarantine(attachment_id, verdict=verdict, note=note, actor_id=actor_id)
        if not record:
            return None
        await self._update_metrics(record.safety_status)
        action = _decision_for_verdict(verdict)
        if action != "none":
            decision = Decision(action=action, severity=_severity_for(action), payload={}, reasons=[self.reason])
            await self.enforcer.apply_decision(
                subject_type=record.subject_type,
                subject_id=record.subject_id,
                actor_id=actor_id,
                base_reason=self.reason,
                decision=decision,
                policy_id=None,
            )
        return QuarantineItem.from_record(record)

    async def _update_metrics(self, _status: str) -> None:
        for bucket in {"needs_review", "quarantined"}:
            backlog = await self.repository.count_by_status(bucket)
            metrics.QUARANTINE_BACKLOG_GAUGE.labels(bucket).set(backlog)


def _decision_for_verdict(verdict: str) -> str:
    verdict = verdict.lower()
    if verdict == "blocked":
        return "remove"
    if verdict == "tombstone":
        return "tombstone"
    return "none"


def _severity_for(action: str) -> int:
    if action == "remove":
        return 5
    if action == "tombstone":
        return 4
    return 1
