"""Reaction endpoints for communities."""

from __future__ import annotations

from uuid import UUID

from fastapi import APIRouter, Depends, Query, Response

from app.communities.api._errors import to_http_error
from app.communities.domain.services import CommunitiesService
from app.communities.schemas import dto
from app.infra.auth import AuthenticatedUser, get_current_user

router = APIRouter(tags=["communities:reactions"])
_service = CommunitiesService()


@router.post("/reactions", status_code=201)
async def add_reaction_endpoint(
	payload: dto.ReactionRequest,
	auth_user: AuthenticatedUser = Depends(get_current_user),
) -> dict:
	try:
		return await _service.add_reaction(auth_user, payload)
	except Exception as exc:  # pragma: no cover
		raise to_http_error(exc) from exc


@router.delete(
	"/reactions",
	status_code=204,
	response_class=Response,
	response_model=None,
)
async def remove_reaction_endpoint(
	subject_type: str = Query(..., pattern="^(post|comment)$"),
	subject_id: UUID = Query(...),
	emoji: str = Query(..., min_length=1, max_length=16),
	auth_user: AuthenticatedUser = Depends(get_current_user),
) -> None:
	try:
		payload = dto.ReactionRequest(subject_type=subject_type, subject_id=subject_id, emoji=emoji)
		await _service.remove_reaction(auth_user, payload)
		return None
	except Exception as exc:  # pragma: no cover
		raise to_http_error(exc) from exc
