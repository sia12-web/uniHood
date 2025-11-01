"""Self-service endpoint allowing users to view active restrictions."""

from __future__ import annotations

from datetime import datetime

from fastapi import APIRouter, Depends
from pydantic import BaseModel

from app.infra.auth import AuthenticatedUser, get_current_user
from app.moderation.domain.container import get_restriction_service

router = APIRouter(prefix="/api/mod/v1/restrictions", tags=["moderation-self-restrictions"])


class SelfRestrictionOut(BaseModel):
    scope: str
    mode: str
    reason: str
    expires_at: datetime | None


class SelfRestrictionsResponse(BaseModel):
    items: list[SelfRestrictionOut]


@router.get("/me", response_model=SelfRestrictionsResponse)
async def list_self_restrictions(user: AuthenticatedUser = Depends(get_current_user)) -> SelfRestrictionsResponse:
    service = get_restriction_service()
    restrictions = await service.list_active(user.id)
    return SelfRestrictionsResponse(
        items=[
            SelfRestrictionOut(
                scope=item.scope,
                mode=item.mode.value,
                reason=item.reason,
                expires_at=item.expires_at,
            )
            for item in restrictions
        ]
    )
