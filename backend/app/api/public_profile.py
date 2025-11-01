"""Public profile read endpoints and matching APIs."""

from __future__ import annotations

from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
from fastapi.security import HTTPAuthorizationCredentials

from app.domain.identity import matching, profile_public, schemas
from app.infra.auth import AuthenticatedUser, get_current_user

router = APIRouter()


async def _maybe_current_user(request: Request) -> Optional[AuthenticatedUser]:
	"""Resolve the current user if credentials are present, otherwise return None."""
	auth_header = request.headers.get("Authorization")
	credentials: Optional[HTTPAuthorizationCredentials] = None
	if auth_header and auth_header.lower().startswith("bearer "):
		token = auth_header.split(" ", 1)[1]
		credentials = HTTPAuthorizationCredentials(scheme="Bearer", credentials=token)
	try:
		return await get_current_user(
			x_user_id=request.headers.get("X-User-Id"),
			x_campus_id=request.headers.get("X-Campus-Id"),
			x_user_roles=request.headers.get("X-User-Roles"),
			credentials=credentials,
		)
	except HTTPException:
		return None


@router.get("/profiles/public/{handle}", response_model=schemas.PublicProfileOut)
async def public_profile(handle: str, viewer: Optional[AuthenticatedUser] = Depends(_maybe_current_user)) -> schemas.PublicProfileOut:
	try:
		return await profile_public.get_public_profile(handle, viewer_id=viewer.id if viewer else None)
	except profile_public.PublicProfileNotFound:
		raise HTTPException(status.HTTP_404_NOT_FOUND, detail="profile_not_found") from None


@router.get("/profiles/match", response_model=List[schemas.MatchPerson])
async def match_people_endpoint(
	interests: Optional[List[str]] = Query(default=None),
	skills: Optional[List[str]] = Query(default=None),
	campus_id: Optional[str] = Query(default=None),
	limit: int = Query(default=20, ge=1, le=50),
	viewer: AuthenticatedUser = Depends(get_current_user),
) -> List[schemas.MatchPerson]:
	try:
		return await matching.match_people(
			viewer_id=viewer.id,
			campus_id=campus_id or viewer.campus_id,
			interests=interests,
			skills=skills,
			limit=limit,
		)
	except matching.MatchInputError as exc:
		raise HTTPException(status.HTTP_400_BAD_REQUEST, detail=str(exc)) from None
