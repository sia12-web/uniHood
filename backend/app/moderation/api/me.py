from __future__ import annotations

from fastapi import APIRouter, Depends
from pydantic import BaseModel

from app.infra.auth import AuthenticatedUser, get_current_user
from app.infra.postgres import get_pool
from app.moderation.domain.rbac import resolve_staff_context

router = APIRouter(prefix="/api/mod/v1", tags=["moderation-me"])

class StaffProfileOut(BaseModel):
    id: str
    display_name: str | None = None
    email: str | None = None
    avatar_url: str | None = None
    scopes: list[str]
    campuses: list[str]
    default_campus: str | None = None

@router.get("/me", response_model=StaffProfileOut)
async def get_staff_me(user: AuthenticatedUser = Depends(get_current_user)) -> StaffProfileOut:
    # Use resolve_staff_context to verify they are staff
    context = resolve_staff_context(user)
    
    pool = await get_pool()
    async with pool.acquire() as conn:
        email = await conn.fetchval("SELECT email FROM users WHERE id = $1", user.id)

    # Map to the format expected by the frontend
    return StaffProfileOut(
        id=user.id,
        display_name=user.display_name,
        email=email,
        avatar_url=None,
        scopes=list(context.scopes),
        campuses=list(context.allowed_campuses),
        default_campus=str(user.campus_id) if user.campus_id else None
    )
