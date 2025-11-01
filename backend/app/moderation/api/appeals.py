"""Appeals submission and resolution endpoints."""

from __future__ import annotations

from datetime import datetime
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field

from app.infra.auth import AuthenticatedUser, get_admin_user, get_current_user
from app.moderation.domain.cases_service import (
    AppealAlreadyOpenError,
    AppealNotAllowedError,
    AppealNotFoundError,
    CaseNotFoundError,
    CaseService,
)
from app.moderation.domain.container import get_case_service
from app.moderation.domain.enforcement import ModerationAppeal

from .cases import CaseSummaryOut


router = APIRouter(prefix="/api/mod/v1/appeals", tags=["moderation-appeals"])


class AppealIn(BaseModel):
    case_id: str
    note: str = Field(..., min_length=10, max_length=2000)


class AppealResolveIn(BaseModel):
    status: Literal["accepted", "rejected"]
    note: str | None = Field(default=None, max_length=2000)


class AppealOut(BaseModel):
    appeal_id: str
    case_id: str
    appellant_id: str
    note: str
    status: str
    reviewed_by: str | None
    created_at: datetime
    reviewed_at: datetime | None

    @classmethod
    def from_model(cls, appeal: ModerationAppeal) -> "AppealOut":
        return cls(
            appeal_id=appeal.appeal_id,
            case_id=appeal.case_id,
            appellant_id=appeal.appellant_id,
            note=appeal.note,
            status=appeal.status,
            reviewed_by=appeal.reviewed_by,
            created_at=appeal.created_at,
            reviewed_at=appeal.reviewed_at,
        )


class AppealResponse(BaseModel):
    appeal: AppealOut
    case: CaseSummaryOut


def get_case_service_dep() -> CaseService:
    return get_case_service()


@router.post("", response_model=AppealResponse, status_code=status.HTTP_201_CREATED)
async def submit_appeal(
    body: AppealIn,
    service: CaseService = Depends(get_case_service_dep),
    user: AuthenticatedUser = Depends(get_current_user),
) -> AppealResponse:
    try:
        appeal, case = await service.submit_appeal(case_id=body.case_id, user_id=user.id, note=body.note)
    except CaseNotFoundError as exc:
        raise HTTPException(status_code=404, detail="case_not_found") from exc
    except AppealAlreadyOpenError as exc:
        raise HTTPException(status_code=409, detail="appeal_already_open") from exc
    except AppealNotAllowedError as exc:
        raise HTTPException(status_code=403, detail=str(exc)) from exc
    return AppealResponse(appeal=AppealOut.from_model(appeal), case=CaseSummaryOut.from_model(case))


@router.post("/{appeal_id}/resolve", response_model=AppealResponse)
async def resolve_appeal(
    appeal_id: str,
    body: AppealResolveIn,
    service: CaseService = Depends(get_case_service_dep),
    reviewer: AuthenticatedUser = Depends(get_admin_user),
) -> AppealResponse:
    try:
        appeal, case = await service.resolve_appeal(
            appeal_id=appeal_id,
            reviewer_id=reviewer.id,
            status=body.status,
            note=body.note,
        )
    except AppealNotFoundError as exc:
        raise HTTPException(status_code=404, detail="appeal_not_found") from exc
    except CaseNotFoundError as exc:
        raise HTTPException(status_code=404, detail="case_not_found") from exc
    return AppealResponse(appeal=AppealOut.from_model(appeal), case=CaseSummaryOut.from_model(case))
