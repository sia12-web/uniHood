"""Comment routes for communities."""

from __future__ import annotations

from uuid import UUID

from fastapi import APIRouter, Depends, Header, Query, Response

from app.communities.api._errors import to_http_error
from app.communities.domain.services import CommunitiesService
from app.communities.schemas import dto
from app.infra.auth import AuthenticatedUser, get_current_user

router = APIRouter(tags=["communities:comments"])
_service = CommunitiesService()


@router.get("/posts/{post_id}/comments", response_model=dto.CommentListResponse)
async def list_comments_endpoint(
	post_id: UUID,
	limit: int = Query(default=20, ge=1, le=50),
	after: str | None = Query(default=None),
	before: str | None = Query(default=None),
	auth_user: AuthenticatedUser = Depends(get_current_user),
) -> dto.CommentListResponse:
	try:
		return await _service.list_comments(auth_user, post_id, limit=limit, after=after, before=before)
	except Exception as exc:  # pragma: no cover
		raise to_http_error(exc) from exc


@router.post("/posts/{post_id}/comments", response_model=dto.CommentResponse, status_code=201)
async def create_comment_endpoint(
	post_id: UUID,
	payload: dto.CommentCreateRequest,
	idempotency_key: str | None = Header(default=None, alias="Idempotency-Key"),
	auth_user: AuthenticatedUser = Depends(get_current_user),
) -> dto.CommentResponse:
	try:
		return await _service.create_comment(auth_user, post_id, payload, idempotency_key=idempotency_key)
	except Exception as exc:  # pragma: no cover
		raise to_http_error(exc) from exc


@router.get("/comments/{comment_id}", response_model=dto.CommentResponse)
async def get_comment_endpoint(
	comment_id: UUID,
	auth_user: AuthenticatedUser = Depends(get_current_user),
) -> dto.CommentResponse:
	try:
		return await _service.get_comment(auth_user, comment_id)
	except Exception as exc:  # pragma: no cover
		raise to_http_error(exc) from exc


@router.patch("/comments/{comment_id}", response_model=dto.CommentResponse)
async def update_comment_endpoint(
	comment_id: UUID,
	payload: dto.CommentUpdateRequest,
	auth_user: AuthenticatedUser = Depends(get_current_user),
) -> dto.CommentResponse:
	try:
		return await _service.update_comment(auth_user, comment_id, payload)
	except Exception as exc:  # pragma: no cover
		raise to_http_error(exc) from exc


@router.delete(
	"/comments/{comment_id}",
	status_code=204,
	response_class=Response,
	response_model=None,
)
async def delete_comment_endpoint(
	comment_id: UUID,
	auth_user: AuthenticatedUser = Depends(get_current_user),
) -> None:
	try:
		await _service.delete_comment(auth_user, comment_id)
		return None
	except Exception as exc:  # pragma: no cover
		raise to_http_error(exc) from exc
