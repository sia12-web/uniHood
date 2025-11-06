"""Profile CRUD and avatar upload endpoints."""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, status

from app.domain.identity import policy, profile_service, schemas
from app.domain.identity.service import IdentityServiceError
from app.infra.auth import AuthenticatedUser, get_current_user
from app.obs import metrics as obs_metrics

router = APIRouter()


def _map_policy_error(exc: policy.IdentityPolicyError) -> HTTPException:
	obs_metrics.inc_identity_reject(exc.reason)
	if isinstance(exc, policy.HandleConflict):
		return HTTPException(status.HTTP_409_CONFLICT, detail=exc.reason)
	if isinstance(exc, policy.IdentityRateLimitExceeded):
		return HTTPException(status.HTTP_429_TOO_MANY_REQUESTS, detail=exc.reason)
	return HTTPException(status.HTTP_400_BAD_REQUEST, detail=exc.reason)


@router.get("/profile/me", response_model=schemas.ProfileOut)
async def get_me(auth_user: AuthenticatedUser = Depends(get_current_user)) -> schemas.ProfileOut:
	return await profile_service.get_profile(auth_user.id)


@router.patch("/profile/me", response_model=schemas.ProfileOut)
async def patch_me(
	payload: schemas.ProfilePatch,
	auth_user: AuthenticatedUser = Depends(get_current_user),
) -> schemas.ProfileOut:
	try:
		return await profile_service.patch_profile(auth_user, payload)
	except policy.IdentityPolicyError as exc:
		raise _map_policy_error(exc) from None
	except IdentityServiceError as exc:
		obs_metrics.inc_identity_reject(exc.reason)
		raise HTTPException(status_code=exc.status_code, detail=exc.reason) from None


@router.post("/profile/avatar/presign", response_model=schemas.PresignResponse)
async def avatar_presign(
	payload: schemas.PresignRequest,
	auth_user: AuthenticatedUser = Depends(get_current_user),
) -> schemas.PresignResponse:
	try:
		return await profile_service.presign_avatar(auth_user, payload)
	except policy.IdentityPolicyError as exc:
		raise _map_policy_error(exc) from None


@router.post("/profile/avatar/commit", response_model=schemas.ProfileOut)
async def avatar_commit(
	payload: schemas.AvatarCommitRequest,
	auth_user: AuthenticatedUser = Depends(get_current_user),
) -> schemas.ProfileOut:
	try:
		return await profile_service.commit_avatar(auth_user, payload)
	except policy.IdentityPolicyError as exc:
		raise _map_policy_error(exc) from None
	except IdentityServiceError as exc:
		obs_metrics.inc_identity_reject(exc.reason)
		raise HTTPException(status_code=exc.status_code, detail=exc.reason) from None


@router.post("/profile/gallery/presign", response_model=schemas.PresignResponse)
async def gallery_presign(
	payload: schemas.PresignRequest,
	auth_user: AuthenticatedUser = Depends(get_current_user),
) -> schemas.PresignResponse:
	try:
		return await profile_service.presign_gallery(auth_user, payload)
	except policy.IdentityPolicyError as exc:
		raise _map_policy_error(exc) from None


@router.post("/profile/gallery/commit", response_model=schemas.ProfileOut)
async def gallery_commit(
	payload: schemas.GalleryCommitRequest,
	auth_user: AuthenticatedUser = Depends(get_current_user),
) -> schemas.ProfileOut:
	try:
		return await profile_service.commit_gallery(auth_user, payload)
	except policy.IdentityPolicyError as exc:
		raise _map_policy_error(exc) from None


@router.post("/profile/gallery/remove", response_model=schemas.ProfileOut)
async def gallery_remove(
	payload: schemas.GalleryRemoveRequest,
	auth_user: AuthenticatedUser = Depends(get_current_user),
) -> schemas.ProfileOut:
	try:
		return await profile_service.remove_gallery_image(auth_user, payload)
	except policy.IdentityPolicyError as exc:
		raise _map_policy_error(exc) from None
