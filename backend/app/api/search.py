"""REST endpoints for search & discovery flows."""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException

from app.domain.search import policy, schemas
from app.domain.search.service import SearchService
from app.infra.auth import AuthenticatedUser, get_current_user

router = APIRouter(tags=["search"])

_service = SearchService()


def _as_http_error(exc: Exception) -> HTTPException:
	if isinstance(exc, policy.SearchPolicyError):
		return HTTPException(status_code=exc.status_code, detail=exc.detail)
	return HTTPException(status_code=400, detail=str(exc))


@router.get("/search/users", response_model=schemas.ListResponse[schemas.UserResult])
async def search_users_endpoint(
	query: schemas.SearchUsersQuery = Depends(),
	auth_user: AuthenticatedUser = Depends(get_current_user),
) -> schemas.ListResponse[schemas.UserResult]:
	try:
		return await _service.search_users(auth_user, query)
	except Exception as exc:  # pragma: no cover - FastAPI converts
		raise _as_http_error(exc) from exc


@router.get("/discover/people", response_model=schemas.ListResponse[schemas.UserResult])
async def discover_people_endpoint(
	query: schemas.DiscoverPeopleQuery = Depends(),
	auth_user: AuthenticatedUser = Depends(get_current_user),
) -> schemas.ListResponse[schemas.UserResult]:
	try:
		return await _service.discover_people(auth_user, query)
	except Exception as exc:  # pragma: no cover - FastAPI converts
		raise _as_http_error(exc) from exc


@router.get("/discover/rooms", response_model=schemas.ListResponse[schemas.RoomResult])
async def discover_rooms_endpoint(
	query: schemas.DiscoverRoomsQuery = Depends(),
	auth_user: AuthenticatedUser = Depends(get_current_user),
) -> schemas.ListResponse[schemas.RoomResult]:
	try:
		return await _service.discover_rooms(auth_user, query)
	except Exception as exc:  # pragma: no cover - FastAPI converts
		raise _as_http_error(exc) from exc
