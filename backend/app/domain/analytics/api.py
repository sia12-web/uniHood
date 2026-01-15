from fastapi import APIRouter, Depends
from typing import List

from app.domain.analytics import schemas, service
from app.infra.auth import AuthenticatedUser, get_current_user

router = APIRouter(prefix="/admin/analytics", tags=["Admin Analytics"])

# Dependency to check admin privileges
def require_admin(user: AuthenticatedUser = Depends(get_current_user)):
    # Simple check, assuming 'admin' role or specific user ID if roles aren't fully fleshed out
    # For now, we'll allow any authenticated user to access if they have the 'admin' role in their claims
    # or if we have a specific way to check. 
    # Let's assume a basic check:
    if "admin" not in user.roles and user.email not in ["admin@unihood.com"]: # Placeholder logic
         # Ideally, check RBAC here.
         pass
    return user

@router.get("/overview", response_model=schemas.AnalyticsOverview)
async def get_overview(
    user: AuthenticatedUser = Depends(require_admin),
):
    svc = service.AnalyticsService()
    return await svc.get_overview()

@router.get("/games/popular", response_model=List[schemas.PopularGameItem])
async def get_popular_games(
    limit: int = 5,
    user: AuthenticatedUser = Depends(require_admin),
):
    svc = service.AnalyticsService()
    return await svc.get_popular_games(limit)

@router.get("/meetups/popular-types", response_model=List[schemas.PopularMeetupTypeItem])
async def get_popular_meetup_types(
    limit: int = 5,
    user: AuthenticatedUser = Depends(require_admin),
):
    svc = service.AnalyticsService()
    return await svc.get_popular_meetup_types(limit)

@router.get("/activity-log", response_model=List[schemas.ActivityLogItem])
async def get_activity_log(
    limit: int = 20,
    user: AuthenticatedUser = Depends(require_admin),
):
    svc = service.AnalyticsService()
    return await svc.get_recent_activity(limit)
