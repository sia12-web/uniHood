"""Enforcement utilities for moderation decisions."""

from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from typing import Mapping, Optional, Protocol

from .policy_engine import Decision


@dataclass
class ModerationCase:
    """Represents a moderation case persisted in storage."""

    case_id: str
    subject_type: str
    subject_id: str
    status: str
    reason: str
    severity: int
    policy_id: Optional[str]
    created_at: datetime
    updated_at: datetime
    created_by: Optional[str] | None = None


@dataclass
class ModerationAction:
    """Represents an action that should be applied to a case."""

    case_id: str
    action: str
    payload: Mapping[str, object]
    actor_id: Optional[str]
    created_at: datetime


@dataclass
class AuditLogEntry:
    """Represents an immutable audit trail row."""

    actor_id: Optional[str]
    action: str
    target_type: str
    target_id: str
    meta: Mapping[str, object]
    created_at: datetime


class ModerationRepository(Protocol):
    """Storage contract used by the enforcement layer."""

    async def upsert_case(
        self,
        subject_type: str,
        subject_id: str,
        reason: str,
        severity: int,
        policy_id: Optional[str],
        created_by: Optional[str],
    ) -> ModerationCase:
        ...

    async def record_action(self, case_id: str, action: str, payload: Mapping[str, object], actor_id: Optional[str]) -> ModerationAction:
        ...

    async def already_applied(self, case_id: str, action: str) -> bool:
        ...

    async def update_case_status(self, case_id: str, status: str) -> None:
        ...

    async def audit(self, actor_id: Optional[str], action: str, target_type: str, target_id: str, meta: Mapping[str, object]) -> AuditLogEntry:
        ...

    async def get_case(self, case_id: str) -> ModerationCase | None:
        ...

    async def list_actions(self, case_id: str) -> list[ModerationAction]:
        ...

    async def list_audit(self, *, after: datetime | None, limit: int) -> list[AuditLogEntry]:
        ...


class EnforcementHooks(Protocol):
    """Hooks into upstream domains for applying side effects."""

    async def tombstone(self, case: ModerationCase, payload: Mapping[str, object]) -> None:
        ...

    async def remove(self, case: ModerationCase, payload: Mapping[str, object]) -> None:
        ...

    async def shadow_hide(self, case: ModerationCase, payload: Mapping[str, object]) -> None:
        ...

    async def mute(self, case: ModerationCase, payload: Mapping[str, object]) -> None:
        ...

    async def ban(self, case: ModerationCase, payload: Mapping[str, object]) -> None:
        ...

    async def warn(self, case: ModerationCase, payload: Mapping[str, object]) -> None:
        ...

    async def restrict_create(self, case: ModerationCase, payload: Mapping[str, object], expires_at: datetime) -> None:
        ...


class ModerationEnforcer:
    """Coordinates decision enforcement and persistence."""

    def __init__(self, repository: ModerationRepository, hooks: EnforcementHooks) -> None:
        self.repository = repository
        self.hooks = hooks

    async def apply_decision(
        self,
        subject_type: str,
        subject_id: str,
        actor_id: Optional[str],
        base_reason: str,
        decision: Decision,
        policy_id: Optional[str],
    ) -> tuple[ModerationCase, ModerationAction]:
        case = await self.repository.upsert_case(
            subject_type=subject_type,
            subject_id=subject_id,
            reason=base_reason,
            severity=decision.severity,
            policy_id=policy_id,
            created_by=actor_id,
        )
        if await self.repository.already_applied(case.case_id, decision.action):
            action = ModerationAction(case.case_id, decision.action, decision.payload, actor_id, datetime.now(timezone.utc))
            return case, action
        await self._dispatch(case, decision)
        action = await self.repository.record_action(case.case_id, decision.action, decision.payload, actor_id)
        new_status = "actioned" if decision.action != "none" else case.status
        await self.repository.update_case_status(case.case_id, new_status)
        await self.repository.audit(actor_id, "action.apply", case.subject_type, case.subject_id, {"action": decision.action})
        return case, action

    async def _dispatch(self, case: ModerationCase, decision: Decision) -> None:
        action = decision.action
        payload = decision.payload
        if action == "none":
            return
        handler = getattr(self.hooks, action, None)
        if not handler:
            raise ValueError(f"Unsupported moderation action: {action}")
        if action == "restrict_create":
            ttl = int(payload.get("ttl_minutes", 0)) if payload else 0
            expires_at = datetime.now(timezone.utc) + timedelta(minutes=ttl)
            await handler(case, payload, expires_at)  # type: ignore[arg-type]
            return
        await handler(case, payload)


class InMemoryModerationRepository(ModerationRepository):
    """Lightweight in-memory repository for local development and tests."""

    def __init__(self) -> None:
        self.cases: dict[str, ModerationCase] = {}
    self.actions: dict[str, list[ModerationAction]] = {}
    self.audit_log: list[AuditLogEntry] = []

    async def upsert_case(
        self,
        subject_type: str,
        subject_id: str,
        reason: str,
        severity: int,
        policy_id: Optional[str],
        created_by: Optional[str],
    ) -> ModerationCase:
        key = f"{subject_type}:{subject_id}"
        now = datetime.now(timezone.utc)
        if key in self.cases:
            case = self.cases[key]
            case.updated_at = now
            case.severity = severity
            case.policy_id = policy_id
            case.reason = reason
        else:
            case = ModerationCase(
                case_id=key,
                subject_type=subject_type,
                subject_id=subject_id,
                status="open",
                reason=reason,
                severity=severity,
                policy_id=policy_id,
                created_at=now,
                updated_at=now,
                created_by=created_by,
            )
            self.cases[key] = case
        return case

    async def record_action(self, case_id: str, action: str, payload: Mapping[str, object], actor_id: Optional[str]) -> ModerationAction:
        action_entry = ModerationAction(
            case_id=case_id,
            action=action,
            payload=dict(payload),
            actor_id=actor_id,
            created_at=datetime.now(timezone.utc),
        )
        self.actions.setdefault(case_id, []).append(action_entry)
        return action_entry

    async def already_applied(self, case_id: str, action: str) -> bool:
        return any(entry.action == action for entry in self.actions.get(case_id, []))

    async def update_case_status(self, case_id: str, status: str) -> None:
        if case_id in self.cases:
            self.cases[case_id].status = status
            self.cases[case_id].updated_at = datetime.now(timezone.utc)

    async def audit(self, actor_id: Optional[str], action: str, target_type: str, target_id: str, meta: Mapping[str, object]) -> AuditLogEntry:
        entry = AuditLogEntry(
            actor_id=actor_id,
            action=action,
            target_type=target_type,
            target_id=target_id,
            meta=dict(meta),
            created_at=datetime.now(timezone.utc),
        )
        self.audit_log.append(entry)
        return entry

    async def get_case(self, case_id: str) -> ModerationCase | None:
        return self.cases.get(case_id)

    async def list_actions(self, case_id: str) -> list[ModerationAction]:
        return list(self.actions.get(case_id, []))

    async def list_audit(self, *, after: datetime | None, limit: int) -> list[AuditLogEntry]:
        entries = self.audit_log
        if after:
            entries = [entry for entry in entries if entry.created_at > after]
        return entries[:limit]
