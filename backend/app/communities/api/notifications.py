"""Notification endpoints for communities."""

from __future__ import annotations

from fastapi import APIRouter, Depends, Query

from app.communities.api._errors import to_http_error
from app.communities.domain.notifications_service import NotificationService
from app.communities.schemas import dto
from app.infra.auth import AuthenticatedUser, get_current_user

router = APIRouter(tags=["communities:notifications"])
_service = NotificationService()


@router.get("/notifications", response_model=dto.NotificationListResponse)
async def list_notifications_endpoint(
	limit: int = Query(default=20, ge=1, le=50),
	cursor: str | None = Query(default=None),
	auth_user: AuthenticatedUser = Depends(get_current_user),
) -> dto.NotificationListResponse:
	try:
		return await _service.list_notifications(auth_user, limit=limit, cursor=cursor)
	except Exception as exc:  # pragma: no cover - defensive
		raise to_http_error(exc) from exc


@router.post("/notifications/mark-read", response_model=dto.NotificationMarkReadResponse)
async def mark_notifications_endpoint(
	payload: dto.NotificationMarkReadRequest,
	auth_user: AuthenticatedUser = Depends(get_current_user),
) -> dto.NotificationMarkReadResponse:
	try:
		updated = await _service.mark_notifications(auth_user, payload)
		return dto.NotificationMarkReadResponse(updated=updated)
	except Exception as exc:  # pragma: no cover
		raise to_http_error(exc) from exc


@router.get("/notifications/unread", response_model=dto.NotificationUnreadResponse)
async def unread_notifications_endpoint(
	auth_user: AuthenticatedUser = Depends(get_current_user),
) -> dto.NotificationUnreadResponse:
	try:
		return await _service.unread_count(auth_user)
	except Exception as exc:  # pragma: no cover
		raise to_http_error(exc) from exc


__all__ = ["router"]
