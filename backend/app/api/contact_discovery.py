"""Contact discovery endpoints for opt-in hashing and matching."""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, status

from app.domain.identity import hashmatch, models, policy, schemas
from app.infra.auth import AuthenticatedUser, get_current_user
from app.infra.postgres import get_pool

router = APIRouter(prefix="/contact", tags=["contact"])


def _map_error(exc: policy.IdentityPolicyError) -> HTTPException:
	reason = exc.reason
	if isinstance(exc, policy.IdentityRateLimitExceeded):
		return HTTPException(status.HTTP_429_TOO_MANY_REQUESTS, detail=reason)
	if reason in {"contact_hash_limit", "contact_hash_payload"}:
		return HTTPException(status.HTTP_413_REQUEST_ENTITY_TOO_LARGE, detail=reason)
	if reason in {"contact_optout"}:
		return HTTPException(status.HTTP_403_FORBIDDEN, detail=reason)
	return HTTPException(status.HTTP_400_BAD_REQUEST, detail=reason)


async def _load_user(auth_user: AuthenticatedUser) -> models.User:
	pool = await get_pool()
	async with pool.acquire() as conn:
		row = await conn.fetchrow("SELECT * FROM users WHERE id = $1", auth_user.id)
	if not row:
		raise HTTPException(status.HTTP_404_NOT_FOUND, detail="user_not_found")
	return models.User.from_record(row)


@router.get("/salt", response_model=schemas.ContactSaltResponse)
async def get_contact_salt() -> schemas.ContactSaltResponse:
	return await hashmatch.get_or_rotate_salt()


@router.post("/optin", response_model=schemas.ContactOptInResponse)
async def set_contact_optin(
	payload: schemas.ContactOptInRequest,
	auth_user: AuthenticatedUser = Depends(get_current_user),
) -> schemas.ContactOptInResponse:
	user = await _load_user(auth_user)
	return await hashmatch.set_opt_in(user, payload.enabled)


@router.post("/upload")
async def upload_hashes(
	payload: schemas.ContactHashUpload,
	auth_user: AuthenticatedUser = Depends(get_current_user),
) -> dict:
	user = await _load_user(auth_user)
	try:
		count = await hashmatch.upload_hashes(user, payload.hashes)
	except policy.IdentityPolicyError as exc:
		raise _map_error(exc) from None
	return {"status": "ok", "count": count}


@router.post("/match", response_model=schemas.ContactMatchResult)
async def match_hashes(
	payload: schemas.ContactHashMatch,
	auth_user: AuthenticatedUser = Depends(get_current_user),
) -> schemas.ContactMatchResult:
	user = await _load_user(auth_user)
	try:
		handles = await hashmatch.match_hashes(user, payload.hashes)
	except policy.IdentityPolicyError as exc:
		raise _map_error(exc) from None
	return schemas.ContactMatchResult(handles=handles)
