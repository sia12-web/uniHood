"""Discovery swipe feed endpoints."""

from __future__ import annotations

from fastapi import APIRouter, Depends, Query, status, HTTPException
from uuid import UUID

from app.domain.discovery import service
from app.domain.discovery.schemas import (
	DiscoveryFeedResponse, 
	InteractionPayload, 
	InteractionResponse,
	DiscoveryPrompt,
	DiscoveryProfile,
	DiscoveryProfileUpdate
)
from app.infra.auth import AuthenticatedUser, get_current_user

router = APIRouter(prefix="/discovery", tags=["discovery"])


@router.get("/feed", response_model=DiscoveryFeedResponse)
async def discovery_feed(
	*,
	radius_m: int = Query(default=200, ge=1, le=100000),
	mode: str = Query(default="campus"),
	cursor: str | None = Query(default=None),
	limit: int = Query(default=20, ge=1, le=100),
	auth_user: AuthenticatedUser = Depends(get_current_user),
) -> DiscoveryFeedResponse:
	clamped_limit = min(limit, 100)
	return await service.list_feed(auth_user, radius_m=radius_m, mode=mode, cursor=cursor, limit=clamped_limit)


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


@router.get("/prompts", response_model=list[DiscoveryPrompt])
async def get_prompts(
	auth_user: AuthenticatedUser = Depends(get_current_user),
) -> list[DiscoveryPrompt]:
	return await service.get_prompts()


@router.get("/profile", response_model=DiscoveryProfile)
async def get_my_discovery_profile(
	auth_user: AuthenticatedUser = Depends(get_current_user),
) -> DiscoveryProfile:
	profile = await service.get_discovery_profile(UUID(str(auth_user.id)))
	if not profile:
		# Return empty default
		return DiscoveryProfile(user_id=UUID(str(auth_user.id)))
	return profile


@router.put("/profile", response_model=DiscoveryProfile)
async def update_my_discovery_profile(
	update: DiscoveryProfileUpdate,
	auth_user: AuthenticatedUser = Depends(get_current_user),
) -> DiscoveryProfile:
	return await service.update_discovery_profile(UUID(str(auth_user.id)), update)


@router.get("/profile/{user_id}", response_model=DiscoveryProfile)
async def get_user_discovery_profile(
	user_id: str,
	auth_user: AuthenticatedUser = Depends(get_current_user),
) -> DiscoveryProfile:
	try:
		uid = UUID(user_id)
	except ValueError:
		raise HTTPException(status_code=400, detail="Invalid user ID")
		
	profile = await service.get_discovery_profile(uid)
	if not profile:
		# Return default empty profile if none exists yet, rather than erroring 
		# This prevents frontend crashes when viewing a user who hasn't set up discovery explicitly
		return DiscoveryProfile(user_id=uid)
	return profile
