"""Phase 2 moderation staff case management API scaffolding."""

from __future__ import annotations

from datetime import datetime
from typing import Literal, Optional

from fastapi import APIRouter, Body, Path, Query
from pydantic import BaseModel, Field

router = APIRouter(prefix="/api/mod/v1/cases", tags=["moderation-cases-phase2"])

StatusFilter = Literal["open", "actioned", "dismissed", "escalated"]
AssignmentFilter = Literal["me", "none"]


class CaseSummary(BaseModel):
    """Abbreviated case representation returned from list queries."""

    case_id: str
    status: str
    escalation_level: int
    assigned_to: Optional[str]
    appeal_open: bool
    updated_at: datetime


class CaseAssignIn(BaseModel):
    moderator_id: str = Field(..., description="Moderator to assign case to.")


class CaseDismissIn(BaseModel):
    note: Optional[str] = Field(None, max_length=2000)


class CaseActionIn(BaseModel):
    action: str = Field(..., description="Moderation action identifier.")
    payload: Optional[dict] = Field(None, description="Arbitrary action payload.")


@router.get("", response_model=list[CaseSummary])
async def list_cases(
    status: Optional[StatusFilter] = Query(None),
    assigned_to: Optional[AssignmentFilter] = Query(None),
) -> list[CaseSummary]:
    """List moderation cases with filtering options (Phase 2 placeholder)."""

    raise NotImplementedError("Phase 2 scaffold – implement filtering via repository")


@router.post("/{case_id}/assign")
async def assign_case(payload: CaseAssignIn = Body(...), case_id: str = Path(...)) -> None:
    """Assign a case to a moderator (Phase 2 placeholder)."""

    raise NotImplementedError("Phase 2 scaffold – update assigned_to and audit")


@router.post("/{case_id}/escalate")
async def escalate_case(case_id: str = Path(...)) -> None:
    """Increment case escalation level (Phase 2 placeholder)."""

    raise NotImplementedError("Phase 2 scaffold – bump escalation and emit stream")


@router.post("/{case_id}/dismiss")
async def dismiss_case(payload: CaseDismissIn = Body(...), case_id: str = Path(...)) -> None:
    """Dismiss the case with an optional note (Phase 2 placeholder)."""

    raise NotImplementedError("Phase 2 scaffold – mark dismissed and audit")


@router.post("/{case_id}/actions")
async def perform_case_action(payload: CaseActionIn = Body(...), case_id: str = Path(...)) -> None:
    """Apply a moderation action through the Phase 1 enforcement pipeline (Phase 2 placeholder)."""

    raise NotImplementedError("Phase 2 scaffold – delegate to enforcement hooks")
