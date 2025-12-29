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
    # Note: In a real app, this should probably be scoped to friends + self, or campus.
    # The current AnalyticsService.get_recent_activity fetches global audit log joined with users.
    # For this MVP phase, we might want to filter it or just use the global one for "City Mode" vibes.
    # Given the user asked for "Recent Activity", we'll return the backend's current logic.
    return await _service.get_recent_activity(limit=limit)
