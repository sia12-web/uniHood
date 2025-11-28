"""Phase 2 moderation reports API scaffolding.

This module mirrors the real FastAPI surface but replaces the persistence layer with
`NotImplementedError` raised in each handler. The goal is to document expected
request and response schemas for Phase 2 while keeping the prototype runnable in
isolation.
"""

from __future__ import annotations

from datetime import datetime
from typing import Optional

from fastapi import APIRouter, Body, status
from pydantic import BaseModel, Field

router = APIRouter(prefix="/api/mod/v1/reports", tags=["moderation-reports-phase2"])


class ReportIn(BaseModel):
    """Incoming moderation report payload."""

    case_id: Optional[str] = Field(None, description="Existing case identifier to attach the report to.")
    subject_type: str = Field(..., pattern=r"^(post|comment|user|group|event|message)$")
    subject_id: str = Field(..., description="Identifier of the reported entity.")
    reporter_id: str = Field(..., description="User submitting the report.")
    reason_code: str = Field(..., pattern=r"^(abuse|harassment|spam|nsfw|other)$")
    note: Optional[str] = Field(None, max_length=2000)


class ReportOut(BaseModel):
    """Response body reflecting the case snapshot after the report is stored."""

    case_id: str
    status: str
    subject_type: str
    subject_id: str
    severity: int
    policy_id: Optional[str]
    escalation_level: int
    appeal_open: bool
    created_at: datetime
    updated_at: datetime


@router.post("", response_model=ReportOut, status_code=status.HTTP_201_CREATED)
async def create_report(payload: ReportIn = Body(...)) -> ReportOut:
    """Ingest a structured moderation report (Phase 2 placeholder)."""

    raise NotImplementedError("Phase 2 scaffold – wire to repository and streams")
