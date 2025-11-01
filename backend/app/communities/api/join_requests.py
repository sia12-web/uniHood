"""Join request submission and moderation endpoints."""

from __future__ import annotations

from uuid import UUID

from fastapi import APIRouter, Depends, Query

from app.communities.api._errors import to_http_error
from app.communities.domain.join_requests_service import JoinRequestsService
from app.communities.schemas import dto
from app.infra.auth import AuthenticatedUser, get_current_user

router = APIRouter(tags=["communities:join-requests"])
_service = JoinRequestsService()


@router.post("/groups/{group_id}/join-requests", response_model=dto.JoinRequestResponse, status_code=201)
async def submit_join_request_endpoint(
	group_id: UUID,
	payload: dto.JoinRequestCreateRequest,
	auth_user: AuthenticatedUser = Depends(get_current_user),
) -> dto.JoinRequestResponse:
	try:
		return await _service.submit(auth_user, group_id, payload)
	except Exception as exc:  # pragma: no cover
		raise to_http_error(exc) from exc


@router.get("/groups/{group_id}/join-requests", response_model=list[dto.JoinRequestResponse])
async def list_join_requests_endpoint(
	group_id: UUID,
	status: str | None = Query(default=None, pattern="^(pending|approved|rejected)$"),
	auth_user: AuthenticatedUser = Depends(get_current_user),
) -> list[dto.JoinRequestResponse]:
	try:
		return await _service.list_requests(auth_user, group_id, status=status)
	except Exception as exc:  # pragma: no cover
		raise to_http_error(exc) from exc


@router.post("/groups/{group_id}/join-requests/{request_id}/review", response_model=dto.JoinRequestResponse)
async def review_join_request_endpoint(
	group_id: UUID,
	request_id: UUID,
	payload: dto.JoinRequestReviewRequest,
	auth_user: AuthenticatedUser = Depends(get_current_user),
) -> dto.JoinRequestResponse:
	try:
		return await _service.review(auth_user, request_id, payload.status)
	except Exception as exc:  # pragma: no cover
		raise to_http_error(exc) from exc


__all__ = ["router"]
