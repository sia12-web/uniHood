"""Communities typeahead routes."""

from __future__ import annotations

from fastapi import APIRouter, Depends, Query

from app.communities.api._errors import to_http_error
from app.communities.search import SearchService
from app.communities.schemas import dto
from app.infra.auth import AuthenticatedUser, get_current_user

router = APIRouter(tags=["communities:typeahead"])
_service = SearchService()


@router.get("/typeahead/groups", response_model=dto.GroupTypeaheadResponse)
async def typeahead_groups_endpoint(
	q: str = Query(..., min_length=1, alias="q"),
	limit: int = Query(5, ge=1, le=25),
	auth_user: AuthenticatedUser = Depends(get_current_user),
) -> dto.GroupTypeaheadResponse:
	try:
		return await _service.typeahead_groups(auth_user, query=q, limit=limit)
	except Exception as exc:  # pragma: no cover - translated by handler
		raise to_http_error(exc) from exc
