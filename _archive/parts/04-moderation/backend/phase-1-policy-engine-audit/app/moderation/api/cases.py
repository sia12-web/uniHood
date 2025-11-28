"""Case query endpoints for moderation staff."""

from __future__ import annotations

from datetime import datetime
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from app.moderation.domain.container import get_enforcer
from app.moderation.domain.enforcement import ModerationAction, ModerationEnforcer

router = APIRouter(prefix="/api/mod/v1/cases", tags=["moderation-cases"])


class ActionOut(BaseModel):
    action: str
    payload: dict[str, object]
    actor_id: str | None
    created_at: datetime

    @classmethod
    def from_model(cls, action: ModerationAction) -> "ActionOut":
        return cls(action=action.action, payload=dict(action.payload), actor_id=action.actor_id, created_at=action.created_at)


class CaseOut(BaseModel):
    case_id: str
    subject_type: str
    subject_id: str
    status: Literal["open", "actioned", "dismissed", "escalated"]
    severity: int
    policy_id: str | None
    actions: list[ActionOut]


def get_enforcer_dep() -> ModerationEnforcer:
    return get_enforcer()


@router.get("/{case_id}", response_model=CaseOut)
async def get_case(case_id: str, enforcer: ModerationEnforcer = Depends(get_enforcer_dep)) -> CaseOut:
    repository = enforcer.repository
    case = await repository.get_case(case_id)
    if not case:
        raise HTTPException(status_code=404, detail="case_not_found")
    actions = [ActionOut.from_model(action) for action in await repository.list_actions(case.case_id)]
    return CaseOut(
        case_id=case.case_id,
        subject_type=case.subject_type,
        subject_id=case.subject_id,
        status=case.status,
        severity=case.severity,
        policy_id=case.policy_id,
        actions=actions,
    )
