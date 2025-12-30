from fastapi import APIRouter, Depends, status
from app.infra.auth import get_current_user, AuthenticatedUser
from app.domain.xp.service import XPService

router = APIRouter(prefix="/xp", tags=["xp"])

@router.get("/daily-checklist", status_code=status.HTTP_200_OK)
async def get_daily_checklist(
    current_user: AuthenticatedUser = Depends(get_current_user)
):
    """
    Get the user's daily XP checklist progress.
    """
    service = XPService()
    progress = await service.get_daily_checklist(current_user.id)
    return progress
