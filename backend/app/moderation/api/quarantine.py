"""Moderation quarantine management endpoints."""

from __future__ import annotations

from datetime import datetime
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel, Field

from app.moderation.domain.container import get_enforcer, get_safety_repository
from app.moderation.workers.quarantine_manager import QuarantineItem, QuarantineManager

router = APIRouter(prefix="/api/mod/v1/quarantine", tags=["moderation-quarantine"])


class QuarantineItemOut(BaseModel):
    attachment_id: str
    subject_type: str
    subject_id: str
    safety_status: str
    created_at: datetime | None
    scanned_at: datetime | None
    safety_score: dict[str, object]

    @classmethod
    def from_domain(cls, item: QuarantineItem) -> "QuarantineItemOut":
        return cls(
            attachment_id=item.attachment_id,
            subject_type=item.subject_type,
            subject_id=item.subject_id,
            safety_status=item.safety_status,
            created_at=item.created_at,
            scanned_at=item.scanned_at,
            safety_score=dict(item.safety_score),
        )


class QuarantineDecisionIn(BaseModel):
    verdict: str = Field(pattern=r"^(clean|blocked|tombstone)$")
    note: str | None = None
    actor_id: str | None = Field(default=None, description="Moderator performing the action")


class QuarantineDecisionOut(BaseModel):
    item: QuarantineItemOut

    @classmethod
    def from_domain(cls, item: QuarantineItem) -> "QuarantineDecisionOut":
        return cls(item=QuarantineItemOut.from_domain(item))


async def _manager_dep() -> QuarantineManager:
    return QuarantineManager(repository=get_safety_repository(), enforcer=get_enforcer())


@router.get("", response_model=list[QuarantineItemOut])
async def list_quarantine(
    *,
    status: Annotated[
        str,
        Query(
            pattern=r"^(needs_review|quarantined)$",
            description="Filter by safety status",
        ),
    ] = "needs_review",
    after: datetime | None = Query(default=None, description="Return items created after this timestamp"),
    limit: int = Query(default=50, ge=1, le=100),
    manager: QuarantineManager = Depends(_manager_dep),
) -> list[QuarantineItemOut]:
    items = await manager.list_items(status=status, after=after, limit=limit)
    return [QuarantineItemOut.from_domain(item) for item in items]


@router.post("/{attachment_id}/decision", response_model=QuarantineDecisionOut)
async def resolve_quarantine(
    attachment_id: str,
    body: QuarantineDecisionIn,
    manager: QuarantineManager = Depends(_manager_dep),
) -> QuarantineDecisionOut:
    item = await manager.resolve(
        attachment_id,
        verdict=body.verdict,
        note=body.note,
        actor_id=body.actor_id,
    )
    if not item:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="attachment_not_found")
    return QuarantineDecisionOut.from_domain(item)
