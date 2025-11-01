"""Staff endpoints for inspecting reputation state."""

from __future__ import annotations

from datetime import datetime

from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel, Field

from app.infra.auth import AuthenticatedUser, get_admin_user
from app.moderation.domain.container import get_reputation_service
from app.moderation.domain.reputation import ReputationEvent, ReputationScore

router = APIRouter(prefix="/api/mod/v1/reputation", tags=["moderation-reputation"])


class ReputationEventOut(BaseModel):
    user_id: str
    surface: str
    kind: str
    delta: int
    created_at: datetime
    device_fp: str | None = None
    ip: str | None = None
    meta: dict[str, object] = Field(default_factory=dict)

    @classmethod
    def from_domain(cls, event: ReputationEvent) -> "ReputationEventOut":
        return cls(
            user_id=event.user_id,
            surface=event.surface,
            kind=event.kind,
            delta=event.delta,
            created_at=event.created_at,
            device_fp=event.device_fp,
            ip=event.ip,
            meta=dict(event.meta),
        )


class ReputationOut(BaseModel):
    user_id: str
    score: int
    band: str
    last_event_at: datetime
    events: list[ReputationEventOut]

    @classmethod
    def from_domain(cls, score: ReputationScore, events: list[ReputationEvent]) -> "ReputationOut":
        return cls(
            user_id=score.user_id,
            score=score.score,
            band=score.band.value,
            last_event_at=score.last_event_at,
            events=[ReputationEventOut.from_domain(evt) for evt in events],
        )


class AdjustIn(BaseModel):
    delta: int = Field(..., ge=-50, le=50)
    note: str | None = Field(default=None, max_length=500)


@router.get("/{user_id}", response_model=ReputationOut)
async def get_reputation(
    user_id: str,
    *,
    limit: int = Query(default=20, ge=1, le=100),
    offset: int = Query(default=0, ge=0, le=1000),
    _: AuthenticatedUser = Depends(get_admin_user),
):
    service = get_reputation_service()
    score = await service.get_or_create(user_id)
    events = await service.list_recent_events(user_id, limit=limit, offset=offset)
    return ReputationOut.from_domain(score, list(events))


@router.post("/{user_id}/adjust", response_model=ReputationOut)
async def adjust_reputation(
    user_id: str,
    payload: AdjustIn,
    admin: AuthenticatedUser = Depends(get_admin_user),
):
    service = get_reputation_service()
    score = await service.adjust_manual(user_id, payload.delta, payload.note)
    events = await service.list_recent_events(user_id, limit=20, offset=0)
    return ReputationOut.from_domain(score, list(events))
