"""Reports API surface for moderation phase 2."""

from __future__ import annotations

from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field

from app.moderation.domain.cases_service import (
    CaseService,
    DuplicateReportError,
    ReportLimitExceeded,
)
from app.moderation.domain.container import get_case_service
from app.moderation.domain.enforcement import ModerationCase
from app.infra.auth import AuthenticatedUser, get_current_user

router = APIRouter(prefix="/api/mod/v1/reports", tags=["moderation-reports"])


class ReportIn(BaseModel):
    subject_type: str = Field(..., pattern=r"^(post|comment|user|group|event|message)$")
    subject_id: str
    reason_code: str = Field(..., pattern=r"^(abuse|harassment|spam|nsfw|other)$")
    note: str | None = None


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


def get_case_service_dep() -> CaseService:
    return get_case_service()


@router.post("", response_model=ReportOut, status_code=status.HTTP_201_CREATED)
async def create_report(
    report: ReportIn,
    service: CaseService = Depends(get_case_service_dep),
    reporter: AuthenticatedUser = Depends(get_current_user),
) -> ReportOut:
    try:
        case = await service.submit_report(
            subject_type=report.subject_type,
            subject_id=report.subject_id,
            reporter_id=reporter.id,
            reason_code=report.reason_code,
            note=report.note,
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except DuplicateReportError as exc:
        raise HTTPException(status_code=409, detail="duplicate_report") from exc
    except ReportLimitExceeded as exc:
        raise HTTPException(status_code=429, detail="report_limit_exceeded") from exc
    return ReportOut.from_case(case)
