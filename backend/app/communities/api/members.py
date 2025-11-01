"""Membership management routes."""

from __future__ import annotations

from uuid import UUID

from fastapi import APIRouter, Depends, Response

from app.communities.api._errors import to_http_error
from app.communities.domain.services import CommunitiesService
from app.communities.schemas import dto
from app.infra.auth import AuthenticatedUser, get_current_user

router = APIRouter(tags=["communities:members"])
_service = CommunitiesService()


@router.post("/groups/{group_id}/members", response_model=dto.MemberResponse)
async def join_group_endpoint(
	group_id: UUID,
	auth_user: AuthenticatedUser = Depends(get_current_user),
) -> dto.MemberResponse:
	try:
		return await _service.join_group(auth_user, group_id)
	except Exception as exc:  # pragma: no cover
		raise to_http_error(exc) from exc


@router.patch("/groups/{group_id}/members/{user_id}", response_model=dto.MemberResponse)
async def update_member_endpoint(
	group_id: UUID,
	user_id: UUID,
	payload: dto.MemberUpdateRequest,
	auth_user: AuthenticatedUser = Depends(get_current_user),
) -> dto.MemberResponse:
	try:
		return await _service.update_member(auth_user, group_id, user_id, payload)
	except Exception as exc:  # pragma: no cover
		raise to_http_error(exc) from exc


@router.delete(
	"/groups/{group_id}/members/{user_id}",
	status_code=204,
	response_class=Response,
	response_model=None,
)
async def remove_member_endpoint(
	group_id: UUID,
	user_id: UUID,
	auth_user: AuthenticatedUser = Depends(get_current_user),
) -> None:
	try:
		await _service.remove_member(auth_user, group_id, user_id)
		return None
	except Exception as exc:  # pragma: no cover
		raise to_http_error(exc) from exc
