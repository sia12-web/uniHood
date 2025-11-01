"""Invite endpoints for communities membership management."""

from __future__ import annotations

from uuid import UUID

from fastapi import APIRouter, Depends

from app.communities.api._errors import to_http_error
from app.communities.domain import exceptions as domain_exceptions
from app.communities.domain.invites_service import InvitesService
from app.communities.schemas import dto
from app.infra.auth import AuthenticatedUser, get_current_user

router = APIRouter(tags=["communities:invites"])
_service = InvitesService()


@router.get("/groups/{group_id}/invites", response_model=list[dto.InviteResponse])
async def list_invites_endpoint(
	group_id: UUID,
	auth_user: AuthenticatedUser = Depends(get_current_user),
) -> list[dto.InviteResponse]:
	try:
		return await _service.list_invites(auth_user, group_id)
	except Exception as exc:  # pragma: no cover
		raise to_http_error(exc) from exc


@router.post("/groups/{group_id}/invites", response_model=dto.InviteResponse, status_code=201)
async def create_invite_endpoint(
	group_id: UUID,
	payload: dto.InviteCreateRequest,
	auth_user: AuthenticatedUser = Depends(get_current_user),
) -> dto.InviteResponse:
	try:
		return await _service.create_invite(auth_user, group_id, payload)
	except Exception as exc:  # pragma: no cover
		raise to_http_error(exc) from exc


@router.post("/groups/{group_id}/invites/{invite_id}/accept", response_model=dto.InviteResponse)
async def accept_invite_endpoint(
	group_id: UUID,
	invite_id: UUID,
	auth_user: AuthenticatedUser = Depends(get_current_user),
) -> dto.InviteResponse:
	try:
		invite = await _service.accept_invite(invite_id, auth_user)
		if invite.group_id != group_id:
			raise domain_exceptions.ForbiddenError("invite_group_mismatch")
		return invite
	except Exception as exc:  # pragma: no cover
		raise to_http_error(exc) from exc


__all__ = ["router"]
