"""Feed endpoints for communities."""

from __future__ import annotations

from uuid import UUID

from fastapi import APIRouter, Depends, Query

from app.communities.api._errors import to_http_error
from app.communities.domain.services import CommunitiesService
from app.communities.schemas import dto
from app.infra.auth import AuthenticatedUser, get_admin_user, get_current_user

router = APIRouter(tags=["communities:feeds"])
_service = CommunitiesService()


@router.get("/feeds/user", response_model=dto.FeedListResponse)
async def get_user_feed_endpoint(
    limit: int = Query(default=20, ge=1, le=50),
    after: str | None = Query(default=None),
    auth_user: AuthenticatedUser = Depends(get_current_user),
) -> dto.FeedListResponse:
    try:
        return await _service.get_user_feed(auth_user, limit=limit, after=after)
    except Exception as exc:  # pragma: no cover
        raise to_http_error(exc) from exc


@router.get("/feeds/group/{group_id}", response_model=dto.PostListResponse)
async def get_group_feed_endpoint(
    group_id: UUID,
    limit: int = Query(default=20, ge=1, le=50),
    after: str | None = Query(default=None),
    auth_user: AuthenticatedUser = Depends(get_current_user),
) -> dto.PostListResponse:
    try:
        return await _service.get_group_feed(auth_user, group_id, limit=limit, after=after)
    except Exception as exc:  # pragma: no cover
        raise to_http_error(exc) from exc


@router.post("/feeds/rebuild", response_model=dto.FeedRebuildResponse)
async def enqueue_feed_rebuild_endpoint(
    payload: dto.FeedRebuildRequest,
    admin_user: AuthenticatedUser = Depends(get_admin_user),
) -> dto.FeedRebuildResponse:
    _ = admin_user  # silence unused warning
    try:
        return await _service.enqueue_feed_rebuild(payload)
    except Exception as exc:  # pragma: no cover
        raise to_http_error(exc) from exc


__all__ = ["router"]
