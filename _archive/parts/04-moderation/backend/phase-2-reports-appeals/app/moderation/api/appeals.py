"""Phase 2 moderation appeals API scaffolding."""

from __future__ import annotations

from datetime import datetime
from typing import Optional

from fastapi import APIRouter, Body, Path, status
from pydantic import BaseModel, Field

router = APIRouter(prefix="/api/mod/v1/appeals", tags=["moderation-appeals-phase2"])


class AppealIn(BaseModel):
    """User facing appeal payload."""

    case_id: str = Field(..., description="Case identifier under appeal.")
    note: str = Field(..., min_length=10, max_length=2000)


class AppealOut(BaseModel):
    """Appellant-facing confirmation body."""

    appeal_id: str
    case_id: str
    status: str
    appeal_open: bool
    created_at: datetime


class AppealResolveIn(BaseModel):
    """Staff resolution payload."""

    status: str = Field(..., pattern=r"^(accepted|rejected)$")
    note: Optional[str] = Field(None, max_length=2000)


class AppealResolveOut(BaseModel):
    """Staff acknowledgement body."""

    appeal_id: str
    case_id: str
    status: str
    reviewed_by: str
    reviewed_at: datetime


@router.post("", response_model=AppealOut, status_code=status.HTTP_201_CREATED)
async def submit_appeal(payload: AppealIn = Body(...)) -> AppealOut:
    """Submit an appeal for a moderated case (Phase 2 placeholder)."""

    raise NotImplementedError("Phase 2 scaffold – persist mod_appeal and emit stream")


@router.post("/{appeal_id}/resolve", response_model=AppealResolveOut)
async def resolve_appeal(
    payload: AppealResolveIn = Body(...),
    appeal_id: str = Path(..., description="Appeal identifier to resolve."),
) -> AppealResolveOut:
    """Resolve an existing appeal (Phase 2 placeholder)."""

    raise NotImplementedError("Phase 2 scaffold – update appeal and close case")
