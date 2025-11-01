"""Post routes for communities."""

from __future__ import annotations

from uuid import UUID

from fastapi import APIRouter, Depends, Header, Query, Response

from app.communities.api._errors import to_http_error
from app.communities.domain.services import CommunitiesService
from app.communities.schemas import dto
from app.infra.auth import AuthenticatedUser, get_current_user

router = APIRouter(tags=["communities:posts"])
_service = CommunitiesService()


@router.get("/groups/{group_id}/posts", response_model=dto.PostListResponse)
async def list_posts_endpoint(
	group_id: UUID,
	limit: int = Query(default=20, ge=1, le=50),
	after: str | None = Query(default=None),
	before: str | None = Query(default=None),
	auth_user: AuthenticatedUser = Depends(get_current_user),
) -> dto.PostListResponse:
	try:
		return await _service.list_posts(auth_user, group_id, limit=limit, after=after, before=before)
	except Exception as exc:  # pragma: no cover
		raise to_http_error(exc) from exc


@router.post("/groups/{group_id}/posts", response_model=dto.PostResponse, status_code=201)
async def create_post_endpoint(
	group_id: UUID,
	payload: dto.PostCreateRequest,
	idempotency_key: str | None = Header(default=None, alias="Idempotency-Key"),
	auth_user: AuthenticatedUser = Depends(get_current_user),
) -> dto.PostResponse:
	try:
		return await _service.create_post(auth_user, group_id, payload, idempotency_key=idempotency_key)
	except Exception as exc:  # pragma: no cover
		raise to_http_error(exc) from exc


@router.get("/posts/{post_id}", response_model=dto.PostResponse)
async def get_post_endpoint(
	post_id: UUID,
	auth_user: AuthenticatedUser = Depends(get_current_user),
) -> dto.PostResponse:
	try:
		return await _service.get_post(auth_user, post_id)
	except Exception as exc:  # pragma: no cover
		raise to_http_error(exc) from exc


@router.patch("/posts/{post_id}", response_model=dto.PostResponse)
async def update_post_endpoint(
	post_id: UUID,
	payload: dto.PostUpdateRequest,
	auth_user: AuthenticatedUser = Depends(get_current_user),
) -> dto.PostResponse:
	try:
		return await _service.update_post(auth_user, post_id, payload)
	except Exception as exc:  # pragma: no cover
		raise to_http_error(exc) from exc


@router.delete(
	"/posts/{post_id}",
	status_code=204,
	response_class=Response,
	response_model=None,
)
async def delete_post_endpoint(
	post_id: UUID,
	auth_user: AuthenticatedUser = Depends(get_current_user),
) -> None:
	try:
		await _service.delete_post(auth_user, post_id)
		return None
	except Exception as exc:  # pragma: no cover
		raise to_http_error(exc) from exc


@router.post("/posts/{post_id}/pin", response_model=dto.PostResponse)
async def pin_post_endpoint(
	post_id: UUID,
	auth_user: AuthenticatedUser = Depends(get_current_user),
) -> dto.PostResponse:
	try:
		return await _service.pin_post(auth_user, post_id, state=True)
	except Exception as exc:  # pragma: no cover
		raise to_http_error(exc) from exc


@router.delete("/posts/{post_id}/pin", response_model=dto.PostResponse)
async def unpin_post_endpoint(
	post_id: UUID,
	auth_user: AuthenticatedUser = Depends(get_current_user),
) -> dto.PostResponse:
	try:
		return await _service.pin_post(auth_user, post_id, state=False)
	except Exception as exc:  # pragma: no cover
		raise to_http_error(exc) from exc
