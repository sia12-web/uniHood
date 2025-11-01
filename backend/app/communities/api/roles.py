"""Role management routes for communities."""

from __future__ import annotations

from uuid import UUID

from fastapi import APIRouter, Depends

from app.communities.api._errors import to_http_error
from app.communities.domain.roles_service import RolesService
from app.communities.schemas import dto
from app.infra.auth import AuthenticatedUser, get_current_user

router = APIRouter(tags=["communities:roles"])
_service = RolesService()


@router.get("/groups/{group_id}/roles", response_model=list[dto.MemberResponse])
async def list_roles_endpoint(
	group_id: UUID,
	auth_user: AuthenticatedUser = Depends(get_current_user),
) -> list[dto.MemberResponse]:
	try:
		return await _service.list_roles(auth_user, group_id)
	except Exception as exc:  # pragma: no cover
		raise to_http_error(exc) from exc


@router.post("/groups/{group_id}/roles", response_model=dto.MemberResponse)
async def assign_role_endpoint(
	group_id: UUID,
	payload: dto.RoleAssignmentRequest,
	auth_user: AuthenticatedUser = Depends(get_current_user),
) -> dto.MemberResponse:
	try:
		return await _service.assign_role(auth_user, group_id, payload)
	except Exception as exc:  # pragma: no cover
		raise to_http_error(exc) from exc


__all__ = ["router"]
