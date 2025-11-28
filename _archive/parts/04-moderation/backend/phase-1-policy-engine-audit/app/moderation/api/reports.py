"""Reports API surface for moderation phase 1."""

from __future__ import annotations

from datetime import datetime, timezone
from typing import Any

from fastapi import APIRouter, Depends, status
from pydantic import BaseModel, Field

from app.moderation.domain.container import get_enforcer, get_repository
from app.moderation.domain.enforcement import ModerationCase, ModerationEnforcer

router = APIRouter(prefix="/api/mod/v1/reports", tags=["moderation-reports"])


class ReportIn(BaseModel):
    subject_type: str = Field(..., regex=r"^(post|comment|user|group|event|message)$")
    subject_id: str
    reason_code: str = Field(..., regex=r"^(abuse|harassment|spam|nsfw|other)$")
    note: str | None = None
    reporter_id: str | None = None


class ReportOut(BaseModel):
    case_id: str
    status: str
    subject_type: str
    subject_id: str
    severity: int
    policy_id: str | None
    created_at: datetime
    updated_at: datetime

    @classmethod
    def from_case(cls, case: ModerationCase) -> "ReportOut":
        return cls(
            case_id=case.case_id,
            status=case.status,
            subject_type=case.subject_type,
            subject_id=case.subject_id,
            severity=case.severity,
            policy_id=case.policy_id,
            created_at=case.created_at,
            updated_at=case.updated_at,
        )


def get_enforcer_dep() -> ModerationEnforcer:
    return get_enforcer()


@router.post("", response_model=ReportOut, status_code=status.HTTP_201_CREATED)
async def create_report(report: ReportIn, enforcer: ModerationEnforcer = Depends(get_enforcer_dep)) -> ReportOut:
    repository = get_repository()
    case = await repository.upsert_case(
        subject_type=report.subject_type,
        subject_id=report.subject_id,
        reason="report",
        severity=0,
        policy_id=None,
        created_by=report.reporter_id,
    )
    await repository.audit(
        actor_id=report.reporter_id,
        action="report.create",
        target_type=report.subject_type,
        target_id=report.subject_id,
        meta={"reason_code": report.reason_code, "note": report.note or ""},
    )
    await repository.record_action(case.case_id, "none", {}, report.reporter_id)
    return ReportOut.from_case(case)
