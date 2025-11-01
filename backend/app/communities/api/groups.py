"""Groups API routes."""

from __future__ import annotations

from uuid import UUID

from fastapi import APIRouter, Depends, Header, HTTPException, Response

from app.communities.api._errors import to_http_error
from app.communities.domain.services import CommunitiesService
from app.communities.schemas import dto
from app.infra.auth import AuthenticatedUser, get_current_user

router = APIRouter(tags=["communities:groups"])
_service = CommunitiesService()


@router.post("/groups", response_model=dto.GroupResponse, status_code=201)
async def create_group_endpoint(
	payload: dto.GroupCreateRequest,
	idempotency_key: str | None = Header(default=None, alias="Idempotency-Key"),
	auth_user: AuthenticatedUser = Depends(get_current_user),
) -> dto.GroupResponse:
	try:
		return await _service.create_group(auth_user, payload, idempotency_key=idempotency_key)
	except Exception as exc:  # pragma: no cover
		raise to_http_error(exc) from exc


@router.get("/groups/{group_id}", response_model=dto.GroupResponse)
async def get_group_endpoint(
	group_id: UUID,
	auth_user: AuthenticatedUser = Depends(get_current_user),
) -> dto.GroupResponse:
	try:
		return await _service.get_group(auth_user, group_id)
	except Exception as exc:  # pragma: no cover
		raise to_http_error(exc) from exc


@router.patch("/groups/{group_id}", response_model=dto.GroupResponse)
async def patch_group_endpoint(
	group_id: UUID,
	payload: dto.GroupUpdateRequest,
	auth_user: AuthenticatedUser = Depends(get_current_user),
) -> dto.GroupResponse:
	try:
		return await _service.update_group(auth_user, group_id, payload)
	except Exception as exc:  # pragma: no cover
		raise to_http_error(exc) from exc


@router.delete(
	"/groups/{group_id}",
	status_code=204,
	response_class=Response,
	response_model=None,
)
async def delete_group_endpoint(
	group_id: UUID,
	auth_user: AuthenticatedUser = Depends(get_current_user),
) -> None:
	try:
		await _service.delete_group(auth_user, group_id)
		return None
	except Exception as exc:  # pragma: no cover
		raise to_http_error(exc) from exc


@router.get("/groups", response_model=dto.GroupListResponse)
async def list_groups_endpoint(limit: int = 20, offset: int = 0) -> dto.GroupListResponse:
	try:
		return await _service.list_groups(limit=limit, offset=offset)
	except Exception as exc:  # pragma: no cover
		raise to_http_error(exc) from exc
