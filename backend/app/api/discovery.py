"""Discovery swipe feed endpoints."""

from __future__ import annotations

from fastapi import APIRouter, Depends, Query, status
from uuid import UUID

from app.domain.discovery import service
from app.domain.discovery.schemas import DiscoveryFeedResponse, InteractionPayload, InteractionResponse
from app.infra.auth import AuthenticatedUser, get_current_user

router = APIRouter(prefix="/discovery", tags=["discovery"])


@router.get("/feed", response_model=DiscoveryFeedResponse)
async def discovery_feed(
	*,
	cursor: str | None = Query(default=None),
	limit: int = Query(default=20, ge=1, le=100),
	auth_user: AuthenticatedUser = Depends(get_current_user),
) -> DiscoveryFeedResponse:
	clamped_limit = min(limit, 100)
	return await service.list_feed(auth_user, cursor=cursor, limit=clamped_limit)


@router.post("/like", response_model=InteractionResponse, status_code=status.HTTP_200_OK)
async def discovery_like(
	payload: InteractionPayload,
	auth_user: AuthenticatedUser = Depends(get_current_user),
) -> InteractionResponse:
	return await service.register_like(auth_user, UUID(str(payload.target_id)), cursor=payload.cursor)


@router.post("/pass", response_model=InteractionResponse, status_code=status.HTTP_200_OK)
async def discovery_pass(
	payload: InteractionPayload,
	auth_user: AuthenticatedUser = Depends(get_current_user),
) -> InteractionResponse:
	return await service.register_pass(auth_user, UUID(str(payload.target_id)), cursor=payload.cursor)


@router.post("/undo", response_model=InteractionResponse, status_code=status.HTTP_200_OK)
async def discovery_undo(
	payload: InteractionPayload,
	auth_user: AuthenticatedUser = Depends(get_current_user),
) -> InteractionResponse:
	return await service.undo_interaction(auth_user, UUID(str(payload.target_id)), cursor=payload.cursor)

