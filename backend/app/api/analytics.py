from __future__ import annotations
"""Analytics and activity feed endpoints."""

from typing import List
from fastapi import APIRouter, Depends, Query
from app.domain.analytics import service, schemas
from app.infra.auth import AuthenticatedUser, get_current_user

router = APIRouter(prefix="/analytics", tags=["analytics"])
_service = service.AnalyticsService()

@router.get("/activity", response_model=List[schemas.ActivityLogItem])
async def get_recent_activity(
    limit: int = Query(default=20, ge=1, le=50),
    auth_user: AuthenticatedUser = Depends(get_current_user),
) -> List[schemas.ActivityLogItem]:
    """Get the recent global activity feed (for the dashboard)."""
    return await _service.get_recent_activity(limit=limit, current_user_id=auth_user.id)

@router.post("/activity/{id}/like")
async def toggle_activity_like(
    id: int,
    auth_user: AuthenticatedUser = Depends(get_current_user),
):
    """Toggle a like on an activity feed item."""
    liked = await _service.toggle_like(auth_user.id, id)
    return {"id": id, "liked": liked}
