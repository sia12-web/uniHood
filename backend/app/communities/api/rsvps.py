"""RSVP API endpoints."""

from __future__ import annotations

from uuid import UUID

from fastapi import APIRouter, Depends, Response

from app.communities.api._errors import to_http_error
from app.communities.domain.rsvp_service import RSVPService
from app.communities.schemas import dto
from app.infra.auth import AuthenticatedUser, get_current_user

router = APIRouter(tags=["communities:rsvps"])
_service = RSVPService()


@router.post("/events/{event_id}/rsvps", response_model=dto.RSVPResponse)
async def upsert_rsvp_endpoint(
	event_id: UUID,
	payload: dto.RSVPUpsertRequest,
	auth_user: AuthenticatedUser = Depends(get_current_user),
) -> dto.RSVPResponse:
	try:
		return await _service.upsert_rsvp(auth_user, event_id, payload)
	except Exception as exc:  # pragma: no cover
		raise to_http_error(exc) from exc


@router.patch("/events/{event_id}/rsvps/{user_id}", response_model=dto.RSVPResponse)
async def admin_update_rsvp_endpoint(
	event_id: UUID,
	user_id: UUID,
	payload: dto.RSVPAdminUpdateRequest,
	auth_user: AuthenticatedUser = Depends(get_current_user),
) -> dto.RSVPResponse:
	try:
		return await _service.admin_update_rsvp(auth_user, event_id, user_id, payload)
	except Exception as exc:  # pragma: no cover
		raise to_http_error(exc) from exc


@router.delete(
	"/events/{event_id}/rsvps/{user_id}",
	status_code=204,
	response_class=Response,
	response_model=None,
)
async def delete_rsvp_endpoint(
	event_id: UUID,
	user_id: UUID,
	auth_user: AuthenticatedUser = Depends(get_current_user),
) -> None:
	try:
		await _service.delete_rsvp(auth_user, event_id, user_id)
		return None
	except Exception as exc:  # pragma: no cover
		raise to_http_error(exc) from exc
