"""Case management endpoints for moderation staff."""

from __future__ import annotations

from datetime import datetime
from typing import Any, Literal

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel, Field

from app.moderation.domain.cases_service import (
    CaseNotFoundError,
    CaseService,
    ModerationWorkflowError,
)
from app.moderation.domain.container import get_case_service
from app.moderation.domain.enforcement import ModerationAction, ModerationCase, ModerationReport

router = APIRouter(prefix="/api/mod/v1/cases", tags=["moderation-cases"])


class ActionOut(BaseModel):
    action: str
    payload: dict[str, Any]
    actor_id: str | None
    created_at: datetime

    @classmethod
    def from_model(cls, action: ModerationAction) -> "ActionOut":
        return cls(
            action=action.action,
            payload=dict(action.payload),
            actor_id=action.actor_id,
            created_at=action.created_at,
        )


class ReportOut(BaseModel):
    report_id: str
    reporter_id: str
    reason_code: str
    note: str | None
    created_at: datetime

    @classmethod
    def from_model(cls, report: ModerationReport) -> "ReportOut":
        return cls(
            report_id=report.report_id,
            reporter_id=report.reporter_id,
            reason_code=report.reason_code,
            note=report.note,
            created_at=report.created_at,
        )


class CaseSummaryOut(BaseModel):
    case_id: str
    subject_type: str
    subject_id: str
    status: Literal["open", "actioned", "dismissed", "escalated", "closed"]
    reason: str
    severity: int
    policy_id: str | None
    assigned_to: str | None
    escalation_level: int
    appeal_open: bool
    appealed_by: str | None
    appeal_note: str | None
    created_at: datetime
    updated_at: datetime

    @classmethod
    def from_model(cls, case: ModerationCase) -> "CaseSummaryOut":
        return cls(
            case_id=case.case_id,
            subject_type=case.subject_type,
            subject_id=case.subject_id,
            status=case.status,
            reason=case.reason,
            severity=case.severity,
            policy_id=case.policy_id,
            assigned_to=case.assigned_to,
            escalation_level=case.escalation_level,
            appeal_open=case.appeal_open,
            appealed_by=case.appealed_by,
            appeal_note=case.appeal_note,
            created_at=case.created_at,
            updated_at=case.updated_at,
        )


class CaseDetailOut(CaseSummaryOut):
    actions: list[ActionOut]
    reports: list[ReportOut]

    @classmethod
    def from_model(
        cls,
        case: ModerationCase,
        *,
        actions: list[ModerationAction],
        reports: list[ModerationReport],
    ) -> "CaseDetailOut":
        base = CaseSummaryOut.from_model(case)
        return cls(
            **base.model_dump(),
            actions=[ActionOut.from_model(action) for action in actions],
            reports=[ReportOut.from_model(report) for report in reports],
        )


class AssignCaseIn(BaseModel):
    actor_id: str = Field(..., description="Moderator performing the assignment")
    moderator_id: str = Field(..., description="Moderator that should own the case")


class EscalateCaseIn(BaseModel):
    actor_id: str


class DismissCaseIn(BaseModel):
    actor_id: str
    note: str | None = None


class CaseActionIn(BaseModel):
    actor_id: str
    action: str
    payload: dict[str, Any] | None = None


def get_case_service_dep() -> CaseService:
    return get_case_service()


@router.get("", response_model=list[CaseSummaryOut])
async def list_cases(
    *,
    status: Literal["open", "actioned", "dismissed", "escalated", "closed", None] = Query(default=None),
    assigned_to: Literal["me", "none", None] | str = Query(default=None),
    moderator_id: str | None = Query(default=None, description="Moderator id when using assigned_to=me"),
    service: CaseService = Depends(get_case_service_dep),
) -> list[CaseSummaryOut]:
    assigned_filter: str | None
    if assigned_to == "me":
        if not moderator_id:
            raise HTTPException(status_code=400, detail="moderator_id_required")
        assigned_filter = moderator_id
    else:
        assigned_filter = assigned_to
    cases = await service.list_cases(status=status, assigned_to=assigned_filter)
    return [CaseSummaryOut.from_model(case) for case in cases]


@router.get("/{case_id}", response_model=CaseDetailOut)
async def get_case(case_id: str, service: CaseService = Depends(get_case_service_dep)) -> CaseDetailOut:
    case = await service.repository.get_case(case_id)
    if not case:
        raise HTTPException(status_code=404, detail="case_not_found")
    return await _hydrate_case_detail(service, case)


@router.post("/{case_id}/assign", response_model=CaseDetailOut)
async def assign_case(case_id: str, body: AssignCaseIn, service: CaseService = Depends(get_case_service_dep)) -> CaseDetailOut:
    try:
        case = await service.assign_case(case_id=case_id, moderator_id=body.moderator_id, actor_id=body.actor_id)
    except CaseNotFoundError as exc:
        raise HTTPException(status_code=404, detail="case_not_found") from exc
    return await _hydrate_case_detail(service, case)


@router.post("/{case_id}/escalate", response_model=CaseDetailOut)
async def escalate_case(case_id: str, body: EscalateCaseIn, service: CaseService = Depends(get_case_service_dep)) -> CaseDetailOut:
    try:
        case = await service.escalate_case(case_id=case_id, actor_id=body.actor_id)
    except CaseNotFoundError as exc:
        raise HTTPException(status_code=404, detail="case_not_found") from exc
    return await _hydrate_case_detail(service, case)


@router.post("/{case_id}/dismiss", response_model=CaseDetailOut)
async def dismiss_case(case_id: str, body: DismissCaseIn, service: CaseService = Depends(get_case_service_dep)) -> CaseDetailOut:
    try:
        case = await service.dismiss_case(case_id=case_id, actor_id=body.actor_id, note=body.note)
    except CaseNotFoundError as exc:
        raise HTTPException(status_code=404, detail="case_not_found") from exc
    return await _hydrate_case_detail(service, case)


@router.post("/{case_id}/actions", response_model=CaseDetailOut, status_code=status.HTTP_200_OK)
async def apply_case_action(case_id: str, body: CaseActionIn, service: CaseService = Depends(get_case_service_dep)) -> CaseDetailOut:
    try:
        case = await service.perform_case_action(
            case_id=case_id,
            actor_id=body.actor_id,
            action=body.action,
            payload=body.payload,
        )
    except CaseNotFoundError as exc:
        raise HTTPException(status_code=404, detail="case_not_found") from exc
    except ModerationWorkflowError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    return await _hydrate_case_detail(service, case)


async def _hydrate_case_detail(service: CaseService, case: ModerationCase) -> CaseDetailOut:
    actions = await service.enforcer.repository.list_actions(case.case_id)
    reports = await service.list_reports_for_case(case.case_id)
    return CaseDetailOut.from_model(case, actions=actions, reports=reports)
