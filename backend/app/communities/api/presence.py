"""Presence heartbeat and lookup endpoints for communities."""

from __future__ import annotations

from uuid import UUID

from fastapi import APIRouter, Depends, Query

from app.communities.api._errors import to_http_error
from app.communities.domain import exceptions as domain_exceptions, repo as repo_module
from app.communities.domain.presence_service import PresenceService
from app.communities.schemas import dto
from app.infra.auth import AuthenticatedUser, get_current_user
from app.obs import metrics as obs_metrics

router = APIRouter(tags=["communities:presence"])
_service = PresenceService()
_repo = repo_module.CommunitiesRepository()


@router.post("/presence/heartbeat", response_model=dto.PresenceListResponse)
async def presence_heartbeat_endpoint(
	payload: dto.PresenceHeartbeatRequest,
	auth_user: AuthenticatedUser = Depends(get_current_user),
) -> dto.PresenceListResponse:
	try:
		if not payload.group_ids:
			return dto.PresenceListResponse(group_id=None, items=[])
		valid_group_ids: list[UUID] = []
		for group_id in payload.group_ids:
			membership = await _repo.get_member(group_id, UUID(auth_user.id))
			if membership is None or membership.is_banned:
				obs_metrics.inc_presence_reject("membership")
				raise domain_exceptions.ForbiddenError("membership_required")
			valid_group_ids.append(group_id)
		filtered = dto.PresenceHeartbeatRequest(group_ids=valid_group_ids)
		return await _service.heartbeat(auth_user, filtered)
	except Exception as exc:  # pragma: no cover
		raise to_http_error(exc) from exc


@router.get("/presence/{group_id}", response_model=dto.PresenceListResponse)
async def presence_list_endpoint(
	group_id: UUID,
	auth_user: AuthenticatedUser = Depends(get_current_user),
	limit: int = Query(default=50, ge=1, le=200),  # reserved for potential future pagination
) -> dto.PresenceListResponse:
	try:
		membership = await _repo.get_member(group_id, UUID(auth_user.id))
		if membership is None or membership.is_banned:
			obs_metrics.inc_presence_reject("membership")
			raise domain_exceptions.ForbiddenError("membership_required")
		return await _service.list_group_presence(auth_user, group_id)
	except Exception as exc:  # pragma: no cover
		raise to_http_error(exc) from exc


__all__ = ["router"]
