"""Communities search API endpoints."""

from __future__ import annotations

from fastapi import APIRouter, Depends, Query

from app.communities.api._errors import to_http_error
from app.communities.search import SearchService
from app.communities.schemas import dto
from app.infra.auth import AuthenticatedUser, get_current_user

router = APIRouter(tags=["communities:search"])
_service = SearchService()


@router.get("/search/groups", response_model=dto.GroupSearchResponse)
async def search_groups_endpoint(
	q: str = Query(..., min_length=1, alias="q"),
	limit: int = Query(10, ge=1, le=50),
	auth_user: AuthenticatedUser = Depends(get_current_user),
) -> dto.GroupSearchResponse:
	try:
		return await _service.search_groups(auth_user, query=q, limit=limit)
	except Exception as exc:  # pragma: no cover - translated by handler
		raise to_http_error(exc) from exc
