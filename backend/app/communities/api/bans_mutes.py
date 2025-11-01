"""Community moderation endpoints for bans and mutes."""

from __future__ import annotations

from uuid import UUID

from fastapi import APIRouter, Depends

from app.communities.api._errors import to_http_error
from app.communities.domain.moderation_service import ModerationService
from app.communities.schemas import dto
from app.infra.auth import AuthenticatedUser, get_current_user

router = APIRouter(tags=["communities:moderation"])
_service = ModerationService()


@router.get("/groups/{group_id}/bans-mutes", response_model=list[dto.MemberResponse])
async def list_bans_mutes_endpoint(
	group_id: UUID,
	auth_user: AuthenticatedUser = Depends(get_current_user),
) -> list[dto.MemberResponse]:
	try:
		return await _service.list_bans(auth_user, group_id)
	except Exception as exc:  # pragma: no cover
		raise to_http_error(exc) from exc


@router.post("/groups/{group_id}/bans-mutes", response_model=dto.MemberResponse)
async def apply_ban_mute_endpoint(
	group_id: UUID,
	payload: dto.BanMuteRequest,
	auth_user: AuthenticatedUser = Depends(get_current_user),
) -> dto.MemberResponse:
	try:
		return await _service.apply(auth_user, group_id, payload)
	except Exception as exc:  # pragma: no cover
		raise to_http_error(exc) from exc


__all__ = ["router"]
