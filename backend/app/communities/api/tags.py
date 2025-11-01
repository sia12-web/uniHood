"""Topic tag lookup routes."""

from __future__ import annotations

from fastapi import APIRouter, Depends, Query

from app.communities.api._errors import to_http_error
from app.communities.domain.services import CommunitiesService
from app.communities.schemas import dto
from app.infra.auth import AuthenticatedUser, get_current_user

router = APIRouter(tags=["communities:tags"])
_service = CommunitiesService()


@router.get("/tags", response_model=dto.TagLookupResponse)
async def search_tags_endpoint(
	query: str = Query(..., min_length=1, max_length=64),
	auth_user: AuthenticatedUser = Depends(get_current_user),
) -> dto.TagLookupResponse:
	try:
		return await _service.search_tags(query)
	except Exception as exc:  # pragma: no cover
		raise to_http_error(exc) from exc
