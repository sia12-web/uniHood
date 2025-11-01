"""Events API endpoints."""

from __future__ import annotations

from uuid import UUID

from fastapi import APIRouter, Depends, Header, HTTPException, Response

from app.communities.api._errors import to_http_error
from app.communities.domain.events_service import EventsService
from app.communities.schemas import dto
from app.infra.auth import AuthenticatedUser, get_current_user

router = APIRouter(tags=["communities:events"])
_service = EventsService()


@router.post("/groups/{group_id}/events", response_model=dto.EventResponse, status_code=201)
async def create_event_endpoint(
	group_id: UUID,
	payload: dto.EventCreateRequest,
	auth_user: AuthenticatedUser = Depends(get_current_user),
	idempotency_key: str | None = Header(default=None, alias="Idempotency-Key"),
) -> dto.EventResponse:
	try:
		return await _service.create_event(auth_user, group_id, payload, idempotency_key=idempotency_key)
	except Exception as exc:  # pragma: no cover
		raise to_http_error(exc) from exc


@router.get("/groups/{group_id}/events", response_model=dto.EventListResponse)
async def list_events_endpoint(
	group_id: UUID,
	limit: int = 20,
	after: str | None = None,
	scope: str | None = None,
	auth_user: AuthenticatedUser = Depends(get_current_user),
) -> dto.EventListResponse:
	try:
		return await _service.list_group_events(auth_user, group_id, limit=limit, after=after, scope=scope)
	except Exception as exc:  # pragma: no cover
		raise to_http_error(exc) from exc


@router.get("/events/{event_id}", response_model=dto.EventResponse)
async def get_event_endpoint(
	event_id: UUID,
	auth_user: AuthenticatedUser = Depends(get_current_user),
) -> dto.EventResponse:
	try:
		return await _service.get_event(auth_user, event_id)
	except Exception as exc:  # pragma: no cover
		raise to_http_error(exc) from exc


@router.patch("/events/{event_id}", response_model=dto.EventResponse)
async def update_event_endpoint(
	event_id: UUID,
	payload: dto.EventUpdateRequest,
	auth_user: AuthenticatedUser = Depends(get_current_user),
) -> dto.EventResponse:
	try:
		return await _service.update_event(auth_user, event_id, payload)
	except Exception as exc:  # pragma: no cover
		raise to_http_error(exc) from exc


@router.delete(
	"/events/{event_id}",
	status_code=204,
	response_class=Response,
	response_model=None,
)
async def delete_event_endpoint(
	event_id: UUID,
	auth_user: AuthenticatedUser = Depends(get_current_user),
) -> None:
	try:
		await _service.delete_event(auth_user, event_id)
		return None
	except Exception as exc:  # pragma: no cover
		raise to_http_error(exc) from exc


@router.post("/events/{event_id}/reminders/preview", response_model=dto.EventReminderPreviewResponse)
async def preview_reminders_endpoint(
	event_id: UUID,
	auth_user: AuthenticatedUser = Depends(get_current_user),
) -> dto.EventReminderPreviewResponse:
	try:
		return await _service.preview_reminders(auth_user, event_id)
	except Exception as exc:  # pragma: no cover
		raise to_http_error(exc) from exc


@router.get("/events/{event_id}/ics", response_class=Response)
async def download_ics_endpoint(
	event_id: UUID,
	auth_user: AuthenticatedUser = Depends(get_current_user),
) -> Response:
	try:
		ics_body = await _service.export_ics(auth_user, event_id)
		return Response(content=ics_body, media_type="text/calendar; charset=utf-8")
	except Exception as exc:  # pragma: no cover
		raise to_http_error(exc) from exc
