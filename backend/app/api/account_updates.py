"""Account update endpoints covering email change and phone verification."""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, status

from app.domain.identity import email_change, models, phone_verify, policy, schemas
from app.infra.auth import AuthenticatedUser, get_current_user
from app.infra.postgres import get_pool

router = APIRouter(prefix="/account", tags=["account"])


async def _load_user(auth_user: AuthenticatedUser) -> models.User:
	pool = await get_pool()
	async with pool.acquire() as conn:
		row = await conn.fetchrow("SELECT * FROM users WHERE id = $1", auth_user.id)
	if not row:
		raise HTTPException(status.HTTP_404_NOT_FOUND, detail="user_not_found")
	return models.User.from_record(row)


def _map_error(exc: policy.IdentityPolicyError) -> HTTPException:
	reason = exc.reason
	if isinstance(exc, policy.IdentityRateLimitExceeded):
		return HTTPException(status.HTTP_429_TOO_MANY_REQUESTS, detail=reason)
	if reason in {"email_taken", "phone_taken"}:
		return HTTPException(status.HTTP_409_CONFLICT, detail=reason)
	if reason in {"email_change_token_used", "email_change_token_expired", "otp_expired"}:
		return HTTPException(status.HTTP_410_GONE, detail=reason)
	if reason in {"otp_incorrect"}:
		return HTTPException(status.HTTP_401_UNAUTHORIZED, detail=reason)
	if reason in {"otp_locked"}:
		return HTTPException(status.HTTP_423_LOCKED, detail=reason)
	return HTTPException(status.HTTP_400_BAD_REQUEST, detail=reason)


@router.post("/email/change/request")
async def request_email_change(
	payload: schemas.EmailChangeRequestPayload,
	auth_user: AuthenticatedUser = Depends(get_current_user),
) -> dict:
	user = await _load_user(auth_user)
	try:
		token = await email_change.request_change(user, payload.new_email)
	except policy.IdentityPolicyError as exc:
		raise _map_error(exc) from None
	return {"status": "requested", "token": token}


@router.post("/email/change/confirm")
async def confirm_email_change(payload: schemas.EmailChangeConfirmPayload) -> dict:
	try:
		verification_token = await email_change.confirm_change(payload.token)
	except policy.IdentityPolicyError as exc:
		raise _map_error(exc) from None
	return {"status": "confirmed", "verificationToken": verification_token}


@router.post("/phone/request")
async def request_phone_code(
	payload: schemas.PhoneNumberRequest,
	auth_user: AuthenticatedUser = Depends(get_current_user),
) -> dict:
	user = await _load_user(auth_user)
	try:
		await phone_verify.request_code(user, payload.e164)
	except policy.IdentityPolicyError as exc:
		raise _map_error(exc) from None
	return {"status": "sent"}


@router.post("/phone/verify", response_model=schemas.PhoneNumberOut)
async def verify_phone_code(
	payload: schemas.PhoneNumberVerify,
	auth_user: AuthenticatedUser = Depends(get_current_user),
) -> schemas.PhoneNumberOut:
	try:
		phone = await phone_verify.verify_code(auth_user.id, payload.code)
	except policy.IdentityPolicyError as exc:
		raise _map_error(exc) from None
	return schemas.PhoneNumberOut(
		e164=phone.e164,
		verified=phone.verified,
		verified_at=phone.verified_at,
	)


@router.delete("/phone")
async def remove_phone(auth_user: AuthenticatedUser = Depends(get_current_user)) -> dict:
	await phone_verify.remove_phone(auth_user.id)
	return {"status": "removed"}
