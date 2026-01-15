from __future__ import annotations

from datetime import datetime, timezone
from typing import Any, Mapping, Optional
from uuid import UUID, uuid4

import pytest

from app.moderation.domain.cases_service import (
    CaseService,
    MembershipContextMissingError,
    SubjectResolver,
)
from app.moderation.domain.enforcement import (
    AuditLogEntry,
    ModerationAppeal,
    ModerationCase,
    ModerationRepository,
)
from app.moderation.domain.trust import TrustLedger
from app.moderation.workers.reports_worker import ReportsWorker


class FakeRepository(ModerationRepository):
    def __init__(self, case: ModerationCase) -> None:
        self.case = case
        self.appeal: Optional[ModerationAppeal] = None
        self.audit_calls: list[tuple[str | None, str]] = []

    async def upsert_case(
        self,
        subject_type: str,
        subject_id: str,
        reason: str,
        severity: int,
        policy_id: Optional[str],
        created_by: Optional[str],
    ) -> ModerationCase:
        return self.case

    async def record_action(self, case_id: str, action: str, payload: Mapping[str, object], actor_id: Optional[str]):
        raise NotImplementedError

    async def already_applied(self, case_id: str, action: str) -> bool:
        return False

    async def update_case_status(self, case_id: str, status: str) -> None:
        self.case.status = status

    async def audit(
        self,
        actor_id: Optional[str],
        action: str,
        target_type: str,
        target_id: str,
        meta: Mapping[str, object],
    ) -> AuditLogEntry:
        self.audit_calls.append((actor_id, action))
        return AuditLogEntry(
            actor_id=actor_id,
            action=action,
            target_type=target_type,
            target_id=target_id,
            meta=dict(meta),
            created_at=datetime.now(timezone.utc),
        )

    async def get_case(self, case_id: str) -> ModerationCase | None:
        return self.case if self.case.case_id == case_id else None

    async def list_actions(self, case_id: str):
        return []

    async def list_audit(self, *, after: datetime | None, limit: int):
        raise NotImplementedError

    async def list_cases(self, *, status: Optional[str], assigned_to: Optional[str]):
        raise NotImplementedError

    async def assign_case(self, case_id: str, moderator_id: str) -> ModerationCase:
        raise NotImplementedError

    async def escalate_case(self, case_id: str) -> ModerationCase:
        raise NotImplementedError

    async def dismiss_case(self, case_id: str) -> ModerationCase:
        raise NotImplementedError

    async def create_report(
        self,
        case_id: str,
        reporter_id: str,
        reason_code: str,
        note: str | None,
    ):
        raise NotImplementedError

    async def report_exists(self, case_id: str, reporter_id: str) -> bool:
        return False

    async def count_active_reports(self, reporter_id: str) -> int:
        return 0

    async def list_reports_for_case(self, case_id: str):
        return []

    async def create_appeal(self, case_id: str, appellant_id: str, note: str) -> ModerationAppeal:
        appeal = ModerationAppeal(
            appeal_id=str(uuid4()),
            case_id=case_id,
            appellant_id=appellant_id,
            note=note,
            status="pending",
            reviewed_by=None,
            created_at=datetime.now(timezone.utc),
            reviewed_at=None,
        )
        self.appeal = appeal
        self.case.appeal_open = True
        self.case.appealed_by = appellant_id
        self.case.appeal_note = note
        return appeal

    async def get_appeal(self, appeal_id: str) -> ModerationAppeal | None:
        if self.appeal and self.appeal.appeal_id == appeal_id:
            return self.appeal
        return None

    async def resolve_appeal(
        self,
        appeal_id: str,
        reviewer_id: str,
        status: str,
        note: str | None,
    ) -> ModerationAppeal:
        assert self.appeal is not None
        self.appeal.status = status
        self.appeal.reviewed_by = reviewer_id
        self.appeal.reviewed_at = datetime.now(timezone.utc)
        self.case.status = "closed"
        self.case.appeal_open = False
        return self.appeal

    async def set_case_closed(self, case_id: str) -> ModerationCase:
        self.case.status = "closed"
        return self.case


class FakeTrustLedger(TrustLedger):
    def __init__(self) -> None:
        super().__init__(repository=None)  # type: ignore[arg-type]
        self.adjust_calls: list[tuple[str, int]] = []

    async def adjust(self, user_id: str, delta: int) -> int:  # type: ignore[override]
        self.adjust_calls.append((user_id, delta))
        return 50 + delta


class FakeEnforcer:
    def __init__(self) -> None:
        self.reverted_cases: list[str] = []
        self.applied: list[dict[str, Any]] = []

    async def apply_decision(
        self,
        *,
        subject_type: str,
        subject_id: str,
        actor_id: str,
        base_reason: str,
        decision,
        policy_id,
    ) -> None:
        self.applied.append(
            {
                "subject_type": subject_type,
                "subject_id": subject_id,
                "actor_id": actor_id,
                "decision": decision,
                "policy_id": policy_id,
                "base_reason": base_reason,
            }
        )

    async def revert_case_actions(self, case: ModerationCase) -> None:
        self.reverted_cases.append(case.case_id)


class FakeRedis:
    def __init__(self) -> None:
        self.events: list[tuple[str, Mapping[str, Any]]] = []

    async def xadd(self, stream: str, fields: Mapping[str, Any]) -> None:
        self.events.append((stream, dict(fields)))


class FakeResolver(SubjectResolver):
    def __init__(self, owner: str) -> None:
        self.owner = owner

    async def resolve_owner(self, subject_type: str, subject_id: str) -> Optional[str]:
        return self.owner


class FakeNotifications:
    def __init__(self) -> None:
        self.calls: list[dict[str, Any]] = []

    async def persist_notification(
        self,
        *,
        user_id: UUID,
        type: str,
        ref_id: UUID,
        actor_id: UUID,
        payload: Mapping[str, Any],
        max_per_second: int = 5,
    ) -> tuple[None, bool]:
        self.calls.append(
            {
                "user_id": user_id,
                "type": type,
                "ref_id": ref_id,
                "actor_id": actor_id,
                "payload": dict(payload),
            }
        )
        return None, True


class FakeRedisStream:
    def __init__(self) -> None:
        self._reads = 0

    async def xread(self, streams, count: int, block: int):
        if self._reads:
            return []
        self._reads += 1
        payload = {b"reporter_id": b"user-1", b"reason_code": b"spam"}
        return [("mod:reports", [("1-0", payload)])]


class FakeReporterMetrics:
    def __init__(self) -> None:
        self.ids: list[str] = []

    async def increment_reports(self, reporter_id: str) -> int:
        self.ids.append(reporter_id)
        return len(self.ids)


@pytest.mark.asyncio
async def test_perform_case_action_infers_group_from_case_for_membership_actions() -> None:
    group_id = str(uuid4())
    user_id = str(uuid4())
    case = ModerationCase(
        case_id=str(uuid4()),
        subject_type="group",
        subject_id=group_id,
        status="open",
        reason="test",
        severity=1,
        policy_id=None,
        created_at=datetime.now(timezone.utc),
        updated_at=datetime.now(timezone.utc),
        created_by=str(uuid4()),
        assigned_to=None,
        escalation_level=0,
        appeal_open=False,
        appealed_by=None,
        appeal_note=None,
    )
    repository = FakeRepository(case)
    enforcer = FakeEnforcer()
    trust = FakeTrustLedger()
    redis = FakeRedis()

    service = CaseService(
        repository=repository,
        enforcer=enforcer,
        trust=trust,
        redis=redis,
        subject_resolver=FakeResolver(owner=str(uuid4())),
        notifications=None,
        staff_recipient_ids=(),
    )

    await service.perform_case_action(
        case_id=case.case_id,
        actor_id="moderator",
        action="ban",
        payload={"user_id": user_id},
    )

    assert enforcer.applied, "expected moderation decision to be applied"
    applied_payload = enforcer.applied[0]["decision"].payload
    assert applied_payload["group_id"] == group_id
    assert applied_payload["user_id"] == user_id
    assert applied_payload["target_user_id"] == user_id


@pytest.mark.asyncio
async def test_perform_case_action_requires_membership_context_when_missing() -> None:
    user_id = str(uuid4())
    case = ModerationCase(
        case_id=str(uuid4()),
        subject_type="user",
        subject_id=user_id,
        status="open",
        reason="test",
        severity=1,
        policy_id=None,
        created_at=datetime.now(timezone.utc),
        updated_at=datetime.now(timezone.utc),
        created_by=str(uuid4()),
        assigned_to=None,
        escalation_level=0,
        appeal_open=False,
        appealed_by=None,
        appeal_note=None,
    )
    repository = FakeRepository(case)
    enforcer = FakeEnforcer()
    trust = FakeTrustLedger()
    redis = FakeRedis()

    service = CaseService(
        repository=repository,
        enforcer=enforcer,
        trust=trust,
        redis=redis,
        subject_resolver=FakeResolver(owner=str(uuid4())),
        notifications=None,
        staff_recipient_ids=(),
    )

    with pytest.raises(MembershipContextMissingError):
        await service.perform_case_action(
            case_id=case.case_id,
            actor_id="moderator",
            action="mute",
            payload={"duration": 60},
        )

@pytest.mark.asyncio
async def test_submit_appeal_notifies_staff() -> None:
    case = ModerationCase(
        case_id=str(uuid4()),
        subject_type="post",
        subject_id=str(uuid4()),
        status="actioned",
        reason="policy",
        severity=2,
        policy_id="p-1",
        created_at=datetime.now(timezone.utc),
        updated_at=datetime.now(timezone.utc),
        created_by=str(uuid4()),
        assigned_to=None,
        escalation_level=0,
        appeal_open=False,
        appealed_by=None,
        appeal_note=None,
    )
    repository = FakeRepository(case)
    trust = FakeTrustLedger()
    enforcer = FakeEnforcer()
    redis = FakeRedis()
    actor = str(uuid4())
    notifications = FakeNotifications()
    staff_id = str(uuid4())

    service = CaseService(
        repository=repository,
        enforcer=enforcer,
        trust=trust,
        redis=redis,
        subject_resolver=FakeResolver(owner=actor),
        notifications=notifications,
        staff_recipient_ids=(staff_id,),
    )

    await service.submit_appeal(case_id=case.case_id, user_id=actor, note="please review")

    assert redis.events[0][0] == "mod:appeals"
    assert notifications.calls, "expected notifications to be sent"
    assert notifications.calls[0]["type"] == "moderation.appeal.submitted"
    assert notifications.calls[0]["payload"]["case_id"] == case.case_id


@pytest.mark.asyncio
async def test_resolve_appeal_accept_triggers_revert_and_notification() -> None:
    appellant = str(uuid4())
    case = ModerationCase(
        case_id=str(uuid4()),
        subject_type="post",
        subject_id=str(uuid4()),
        status="actioned",
        reason="policy",
        severity=2,
        policy_id="p-1",
        created_at=datetime.now(timezone.utc),
        updated_at=datetime.now(timezone.utc),
        created_by=str(uuid4()),
        assigned_to=None,
        escalation_level=0,
        appeal_open=True,
        appealed_by=appellant,
        appeal_note="note",
    )
    repository = FakeRepository(case)
    repository.appeal = ModerationAppeal(
        appeal_id=str(uuid4()),
        case_id=case.case_id,
        appellant_id=appellant,
        note="note",
        status="pending",
        reviewed_by=None,
        created_at=datetime.now(timezone.utc),
        reviewed_at=None,
    )
    trust = FakeTrustLedger()
    enforcer = FakeEnforcer()
    redis = FakeRedis()
    reviewer = str(uuid4())
    notifications = FakeNotifications()

    service = CaseService(
        repository=repository,
        enforcer=enforcer,
        trust=trust,
        redis=redis,
        subject_resolver=FakeResolver(owner=appellant),
        notifications=notifications,
        staff_recipient_ids=(),
    )

    appeal, updated_case = await service.resolve_appeal(
        appeal_id=repository.appeal.appeal_id,
        reviewer_id=reviewer,
        status="accepted",
        note="all good",
    )

    assert appeal.status == "accepted"
    assert updated_case.status == "closed"
    assert enforcer.reverted_cases == [case.case_id]
    assert (appellant, 2) in trust.adjust_calls
    assert any(call["type"] == "moderation.appeal.resolved" for call in notifications.calls)


@pytest.mark.asyncio
async def test_resolve_appeal_rejected_adjusts_negative() -> None:
    appellant = str(uuid4())
    case = ModerationCase(
        case_id=str(uuid4()),
        subject_type="comment",
        subject_id=str(uuid4()),
        status="actioned",
        reason="policy",
        severity=2,
        policy_id="p-2",
        created_at=datetime.now(timezone.utc),
        updated_at=datetime.now(timezone.utc),
        created_by=str(uuid4()),
        assigned_to=None,
        escalation_level=0,
        appeal_open=True,
        appealed_by=appellant,
        appeal_note="note",
    )
    repository = FakeRepository(case)
    repository.appeal = ModerationAppeal(
        appeal_id=str(uuid4()),
        case_id=case.case_id,
        appellant_id=appellant,
        note="note",
        status="pending",
        reviewed_by=None,
        created_at=datetime.now(timezone.utc),
        reviewed_at=None,
    )
    trust = FakeTrustLedger()
    enforcer = FakeEnforcer()
    redis = FakeRedis()
    reviewer = str(uuid4())

    service = CaseService(
        repository=repository,
        enforcer=enforcer,
        trust=trust,
        redis=redis,
        subject_resolver=FakeResolver(owner=appellant),
        notifications=None,
        staff_recipient_ids=(),
    )

    await service.resolve_appeal(
        appeal_id=repository.appeal.appeal_id,
        reviewer_id=reviewer,
        status="rejected",
        note="policy stands",
    )

    assert enforcer.reverted_cases == []
    assert (appellant, -3) in trust.adjust_calls


@pytest.mark.asyncio
async def test_reports_worker_consumes_stream_and_updates_repository() -> None:
    redis_stream = FakeRedisStream()
    metrics_repo = FakeReporterMetrics()
    worker = ReportsWorker(redis=redis_stream, repository=metrics_repo)

    await worker.run_once()

    assert metrics_repo.ids == ["user-1"]
    assert worker.last_id == "1-0"
