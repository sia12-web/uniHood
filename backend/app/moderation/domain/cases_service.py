"""Case and workflow orchestration for moderation Phase 2."""

from __future__ import annotations

import logging
import time
from dataclasses import dataclass
from typing import Any, Mapping, Optional, Protocol, Sequence
from uuid import UUID

from app.infra.redis import RedisProxy
from app.infra.postgres import get_pool
from app.communities.domain.notifications_service import NotificationService
from app.moderation.domain.enforcement import (
    ModerationAppeal,
    ModerationCase,
    ModerationEnforcer,
    ModerationReport,
    ModerationRepository,
)
from app.moderation.domain.membership_utils import MEMBERSHIP_ACTIONS, ensure_membership_identifiers
from app.moderation.domain.policy_engine import Decision
from app.moderation.domain.trust import TrustLedger
from app.obs import metrics as obs_metrics

logger = logging.getLogger(__name__)


class SubjectResolver(Protocol):
    async def resolve_owner(self, subject_type: str, subject_id: str) -> Optional[str]:
        ...


class ModerationWorkflowError(Exception):
    """Base class for moderation workflow failures."""


class DuplicateReportError(ModerationWorkflowError):
    pass


class ReportLimitExceeded(ModerationWorkflowError):
    pass


class CaseNotFoundError(ModerationWorkflowError):
    pass


class AppealNotAllowedError(ModerationWorkflowError):
    pass


class AppealAlreadyOpenError(ModerationWorkflowError):
    pass


class AppealNotFoundError(ModerationWorkflowError):
    pass


class MembershipContextMissingError(ModerationWorkflowError):
    pass


def _to_uuid(value: Any) -> UUID | None:
    if value is None:
        return None
    try:
        return UUID(str(value))
    except (ValueError, TypeError, AttributeError):
        return None


@dataclass
class CaseService:
    repository: ModerationRepository
    enforcer: ModerationEnforcer
    trust: TrustLedger
    redis: RedisProxy
    subject_resolver: SubjectResolver
    notifications: NotificationService | None = None
    staff_recipient_ids: Sequence[str] = tuple()
    report_stream: str = "mod:reports"
    appeals_stream: str = "mod:appeals"
    escalation_stream: str = "mod:escalations"
    escalation_threshold: int = 4
    max_open_reports: int = 3

    async def _resolve_user_handle_to_id(self, handle_or_id: str) -> str:
        """Resolve a handle to user_id. If it looks like a UUID, return as-is."""
        # Check if it's already a valid UUID
        try:
            UUID(handle_or_id)
            return handle_or_id
        except ValueError:
            pass
        # Otherwise treat as handle and resolve to user_id
        pool = await get_pool()
        async with pool.acquire() as conn:
            row = await conn.fetchrow(
                "SELECT id FROM users WHERE handle = $1 AND deleted_at IS NULL",
                handle_or_id.lower(),
            )
        if not row:
            raise ValueError(f"User not found: {handle_or_id}")
        return str(row["id"])

    async def submit_report(
        self,
        *,
        subject_type: str,
        subject_id: str,
        reporter_id: str,
        reason_code: str,
        note: str | None,
    ) -> ModerationCase:
        if not reporter_id:
            raise ValueError("reporter_id_required")
        
        # For user/profile reports, resolve handle to user_id for security
        resolved_subject_id = subject_id
        if subject_type == "user":
            resolved_subject_id = await self._resolve_user_handle_to_id(subject_id)
        
        if await self.repository.count_active_reports(reporter_id) >= self.max_open_reports:
            raise ReportLimitExceeded("report_limit_exceeded")
        start = time.perf_counter()
        case = await self.repository.upsert_case(
            subject_type=subject_type,
            subject_id=resolved_subject_id,
            reason="report",
            severity=0,
            policy_id=None,
            created_by=reporter_id,
        )
        if await self.repository.report_exists(case.case_id, reporter_id):
            raise DuplicateReportError("duplicate_report")
        await self.repository.create_report(case.case_id, reporter_id, reason_code, note)
        await self._audit(
            reporter_id,
            "report.create",
            case.subject_type,
            case.subject_id,
            {"reason_code": reason_code, "note": note or ""},
        )
        await self.redis.xadd(
            self.report_stream,
            {
                "case_id": case.case_id,
                "subject_type": case.subject_type,
                "subject_id": case.subject_id,
                "reporter_id": reporter_id,
                "reason_code": reason_code,
            },
        )
        elapsed = time.perf_counter() - start
        obs_metrics.MOD_REPORT_CASE_LINK_SECONDS.observe(elapsed)
        obs_metrics.MOD_CASE_TRANSITIONS_TOTAL.labels(transition="report_submitted").inc()
        return case

    async def list_cases(self, *, status: Optional[str], assigned_to: Optional[str]) -> list[ModerationCase]:
        return await self.repository.list_cases(status=status, assigned_to=assigned_to)

    async def assign_case(self, *, case_id: str, moderator_id: str, actor_id: str) -> ModerationCase:
        try:
            case = await self.repository.assign_case(case_id, moderator_id)
        except KeyError as exc:  # pragma: no cover - handled by caller
            raise CaseNotFoundError(str(exc)) from exc
        await self._audit(
            actor_id,
            "case.assign",
            case.subject_type,
            case.subject_id,
            {"moderator_id": moderator_id},
        )
        obs_metrics.MOD_CASE_TRANSITIONS_TOTAL.labels(transition="assigned").inc()
        return case

    async def escalate_case(self, *, case_id: str, actor_id: str) -> ModerationCase:
        try:
            case = await self.repository.escalate_case(case_id)
        except KeyError as exc:
            raise CaseNotFoundError(str(exc)) from exc
        await self._audit(
            actor_id,
            "case.escalate",
            case.subject_type,
            case.subject_id,
            {"escalation_level": case.escalation_level},
        )
        if case.severity >= self.escalation_threshold:
            await self.redis.xadd(
                self.escalation_stream,
                {
                    "case_id": case.case_id,
                    "severity": case.severity,
                    "escalation_level": case.escalation_level,
                },
            )
        obs_metrics.MOD_CASE_TRANSITIONS_TOTAL.labels(transition="escalated").inc()
        return case

    async def dismiss_case(self, *, case_id: str, actor_id: str, note: str | None) -> ModerationCase:
        try:
            case = await self.repository.dismiss_case(case_id)
        except KeyError as exc:
            raise CaseNotFoundError(str(exc)) from exc
        await self._audit(
            actor_id,
            "case.dismiss",
            case.subject_type,
            case.subject_id,
            {"note": note or ""},
        )
        await self._adjust_reporter_trust(case.case_id, delta=-1)
        obs_metrics.MOD_CASE_TRANSITIONS_TOTAL.labels(transition="dismissed").inc()
        return case

    async def perform_case_action(
        self,
        *,
        case_id: str,
        actor_id: str,
        action: str,
        payload: Optional[Mapping[str, Any]],
    ) -> ModerationCase:
        case = await self.repository.get_case(case_id)
        if not case:
            raise CaseNotFoundError(case_id)
        payload_dict: dict[str, Any] = dict(payload or {})
        complete = ensure_membership_identifiers(
            action,
            payload_dict,
            case=case,
            subject={"type": case.subject_type, "id": case.subject_id},
        )
        if action in MEMBERSHIP_ACTIONS and not complete:
            raise MembershipContextMissingError("membership_context_missing")
        decision = Decision(action=action, severity=case.severity, payload=payload_dict, reasons=["manual"])
        await self.enforcer.apply_decision(
            subject_type=case.subject_type,
            subject_id=case.subject_id,
            actor_id=actor_id,
            base_reason="manual_action",
            decision=decision,
            policy_id=case.policy_id,
        )
        updated = await self.repository.get_case(case_id)
        if updated:
            case = updated
        await self._audit(
            actor_id,
            "case.action",
            case.subject_type,
            case.subject_id,
            {"action": action},
        )
        await self._adjust_reporter_trust(case.case_id, delta=1)
        obs_metrics.MOD_CASE_TRANSITIONS_TOTAL.labels(transition="actioned").inc()
        return case

    async def submit_appeal(self, *, case_id: str, user_id: str, note: str) -> tuple[ModerationAppeal, ModerationCase]:
        case = await self.repository.get_case(case_id)
        if not case:
            raise CaseNotFoundError(case_id)
        if case.status not in {"actioned", "dismissed"}:
            raise AppealNotAllowedError("case_not_resolvable")
        if case.appeal_open:
            raise AppealAlreadyOpenError("appeal_open")
        owner = await self.subject_resolver.resolve_owner(case.subject_type, case.subject_id)
        if owner != user_id:
            raise AppealNotAllowedError("not_subject_owner")
        appeal = await self.repository.create_appeal(case.case_id, user_id, note)
        await self._audit(
            user_id,
            "appeal.create",
            case.subject_type,
            case.subject_id,
            {"note": note[:80]},
        )
        await self.redis.xadd(
            self.appeals_stream,
            {"case_id": case.case_id, "appeal_id": appeal.appeal_id, "appellant_id": user_id},
        )
        await self._notify_staff_of_appeal(case.case_id, appeal.appeal_id, user_id)
        obs_metrics.MOD_CASE_TRANSITIONS_TOTAL.labels(transition="appeal_opened").inc()
        obs_metrics.MOD_APPEALS_TOTAL.labels(stage="submitted", outcome="pending").inc()
        updated_case = await self.repository.get_case(case.case_id)
        return appeal, updated_case or case

    async def resolve_appeal(
        self,
        *,
        appeal_id: str,
        reviewer_id: str,
        status: str,
        note: str | None,
    ) -> tuple[ModerationAppeal, ModerationCase]:
        appeal = await self.repository.get_appeal(appeal_id)
        if not appeal:
            raise AppealNotFoundError(appeal_id)
        case = await self.repository.get_case(appeal.case_id)
        if not case:
            raise CaseNotFoundError(appeal.case_id)
        updated_appeal = await self.repository.resolve_appeal(appeal_id, reviewer_id, status, note)
        updated_case = await self.repository.get_case(appeal.case_id)
        if not updated_case:
            updated_case = case
        await self._audit(
            reviewer_id,
            "appeal.resolve",
            case.subject_type,
            case.subject_id,
            {"status": status, "note": note or ""},
        )
        if status == "accepted":
            await self.trust.adjust(updated_appeal.appellant_id, 2)
            await self.enforcer.revert_case_actions(updated_case)
        else:
            await self.trust.adjust(updated_appeal.appellant_id, -3)
        await self._notify_appellant_of_resolution(
            updated_appeal,
            case.subject_type,
            case.subject_id,
        )
        obs_metrics.MOD_CASE_TRANSITIONS_TOTAL.labels(transition="appeal_resolved").inc()
        outcome_label = status if status in {"accepted", "rejected"} else "other"
        obs_metrics.MOD_APPEALS_TOTAL.labels(stage="resolved", outcome=outcome_label).inc()
        return updated_appeal, updated_case

    async def list_reports_for_case(self, case_id: str) -> list[ModerationReport]:
        return await self.repository.list_reports_for_case(case_id)

    async def _audit(
        self,
        actor_id: str | None,
        action: str,
        target_type: str,
        target_id: str,
        meta: Mapping[str, object],
    ) -> None:
        start = time.perf_counter()
        await self.repository.audit(actor_id, action, target_type, target_id, meta)
        elapsed = time.perf_counter() - start
        obs_metrics.MOD_AUDIT_LATENCY_SECONDS.observe(elapsed)

    async def _notify_staff_of_appeal(self, case_id: str, appeal_id: str, actor_id: str) -> None:
        if not self.notifications or not self.staff_recipient_ids:
            return
        case_uuid = _to_uuid(case_id)
        appeal_uuid = _to_uuid(appeal_id)
        actor_uuid = _to_uuid(actor_id) or UUID(int=0)
        if not case_uuid or not appeal_uuid:
            return
        payload = {"case_id": case_id, "appeal_id": appeal_id}
        for recipient in self._iter_staff_recipient_ids():
            try:
                await self.notifications.persist_notification(
                    user_id=recipient,
                    type="moderation.appeal.submitted",
                    ref_id=case_uuid,
                    actor_id=actor_uuid,
                    payload=payload,
                )
            except Exception:  # noqa: BLE001 - notification failures should not block workflow
                logger.exception(
                    "failed to notify staff of appeal",
                    extra={"case_id": case_id, "appeal_id": appeal_id, "recipient": str(recipient)},
                )

    async def _notify_appellant_of_resolution(
        self,
        appeal: ModerationAppeal,
        subject_type: str,
        subject_id: str,
    ) -> None:
        if not self.notifications:
            return
        appellant_uuid = _to_uuid(appeal.appellant_id)
        case_uuid = _to_uuid(appeal.case_id)
        if not appellant_uuid or not case_uuid:
            return
        payload = {
            "status": appeal.status,
            "subject_type": subject_type,
            "subject_id": subject_id,
        }
        reviewer_uuid = _to_uuid(appeal.reviewed_by) or UUID(int=0)
        try:
            await self.notifications.persist_notification(
                user_id=appellant_uuid,
                type="moderation.appeal.resolved",
                ref_id=case_uuid,
                actor_id=reviewer_uuid,
                payload=payload,
            )
        except Exception:  # noqa: BLE001 - do not block resolution on notification errors
            logger.exception(
                "failed to notify appellant of appeal resolution",
                extra={"case_id": appeal.case_id, "appeal_id": appeal.appeal_id},
            )

    def _iter_staff_recipient_ids(self) -> list[UUID]:
        recipients: list[UUID] = []
        for raw in self.staff_recipient_ids:
            parsed = _to_uuid(raw)
            if parsed:
                recipients.append(parsed)
        return recipients

    async def _adjust_reporter_trust(self, case_id: str, *, delta: int) -> None:
        reports = await self.repository.list_reports_for_case(case_id)
        for report in reports:
            await self.trust.adjust(report.reporter_id, delta)
