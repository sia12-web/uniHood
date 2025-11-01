"""Staff endpoints for managing user restrictions."""

from __future__ import annotations

from datetime import timedelta

from fastapi import APIRouter, Depends, HTTPException, Query, Response, status
from pydantic import BaseModel, Field

from app.infra.auth import AuthenticatedUser, get_admin_user
from app.moderation.domain.container import get_restriction_service
from app.moderation.domain.restrictions import Restriction, RestrictionMode

router = APIRouter(prefix="/api/mod/v1/restrictions", tags=["moderation-restrictions"])


class RestrictionOut(BaseModel):
    id: str
    user_id: str
    scope: str
    mode: str
    reason: str
    ttl_seconds: int
    created_at: str
    expires_at: str | None
    created_by: str | None

    @classmethod
    def from_domain(cls, restriction: Restriction) -> "RestrictionOut":
        return cls(
            id=restriction.id,
            user_id=restriction.user_id,
            scope=restriction.scope,
            mode=restriction.mode.value,
            reason=restriction.reason,
            ttl_seconds=restriction.ttl_seconds,
            created_at=restriction.created_at.isoformat(),
            expires_at=restriction.expires_at.isoformat() if restriction.expires_at else None,
            created_by=restriction.created_by,
        )


class CreateRestrictionIn(BaseModel):
    user_id: str
    scope: str = Field(default="global")
    mode: RestrictionMode
    ttl_seconds: int = Field(default=900, ge=0, le=259200)
    reason: str = Field(default="manual", max_length=255)


@router.get("", response_model=list[RestrictionOut])
async def list_restrictions(
    *,
    user_id: str = Query(..., description="Target user id"),
    active_only: bool = Query(default=True),
    _: AuthenticatedUser = Depends(get_admin_user),
) -> list[RestrictionOut]:
    service = get_restriction_service()
    restrictions = await (
        service.list_active(user_id) if active_only else service.list_all(user_id, include_inactive=True)
    )
    return [RestrictionOut.from_domain(item) for item in restrictions]


@router.post("", response_model=RestrictionOut, status_code=status.HTTP_201_CREATED)
async def create_restriction(
    payload: CreateRestrictionIn,
    admin: AuthenticatedUser = Depends(get_admin_user),
) -> RestrictionOut:
    service = get_restriction_service()
    ttl = timedelta(seconds=payload.ttl_seconds)
    restriction = await service.apply_restriction(
        user_id=payload.user_id,
        scope=payload.scope,
        mode=payload.mode,
        reason=payload.reason,
        ttl=ttl,
        created_by=admin.id,
    )
    return RestrictionOut.from_domain(restriction)


@router.delete(
    "/{restriction_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    response_class=Response,
    response_model=None,
)
async def revoke_restriction(
    restriction_id: str,
    _: AuthenticatedUser = Depends(get_admin_user),
) -> None:
    service = get_restriction_service()
    existing = await service.get(restriction_id)
    if existing is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="restriction_not_found")
    await service.revoke(restriction_id)
