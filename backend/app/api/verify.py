"""User-facing verification flows for SSO and document upload."""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Query, status, Request
from app.infra import rate_limit

from app.domain.identity import policy, schemas, verification
from app.infra.auth import AuthenticatedUser, get_current_user
from app.obs import metrics as obs_metrics

router = APIRouter()


import sys

def _inc_reject(reason: str) -> None:
	try:
		getattr(obs_metrics, "inc_identity_reject", lambda x: None)(reason)
	except Exception:
		pass

def _map_policy_error(exc: policy.IdentityPolicyError) -> HTTPException:
	_inc_reject(exc.reason)
	if isinstance(exc, policy.IdentityRateLimitExceeded):
		return HTTPException(status.HTTP_429_TOO_MANY_REQUESTS, detail=exc.reason)
	if exc.reason in {"verification_locked", "verification_decided"}:
		return HTTPException(status.HTTP_409_CONFLICT, detail=exc.reason)
	if exc.reason == "verification_not_found":
		return HTTPException(status.HTTP_404_NOT_FOUND, detail=exc.reason)
	return HTTPException(status.HTTP_400_BAD_REQUEST, detail=exc.reason)


@router.get("/verify/status", response_model=schemas.VerificationStatusResponse)
async def verification_status(auth_user: AuthenticatedUser = Depends(get_current_user)) -> schemas.VerificationStatusResponse:
	return await verification.get_status(auth_user)


@router.post("/verify/sso/{provider}/start", response_model=schemas.VerificationSsoStartResponse)
async def start_verification_sso(
	provider: str,
	redirect_uri: str | None = Query(default=None, max_length=2048),
	auth_user: AuthenticatedUser = Depends(get_current_user),
) -> schemas.VerificationSsoStartResponse:
	try:
		payload = await verification.start_sso(auth_user, provider, redirect_uri=redirect_uri)
		return schemas.VerificationSsoStartResponse(
			authorize_url=payload.authorize_url,
			state=payload.state,
			code_verifier=payload.code_verifier,
			code_challenge=payload.code_challenge,
		)
	except policy.IdentityPolicyError as exc:  # pragma: no cover - handled via HTTP mapping
		raise _map_policy_error(exc) from None


@router.post("/verify/sso/{provider}/complete", response_model=schemas.VerificationEntry)
async def complete_verification_sso(
	provider: str,
	payload: schemas.VerificationSsoCompleteRequest,
) -> schemas.VerificationEntry:
	try:
		return await verification.complete_sso(provider, payload.state, payload.id_token)
	except policy.IdentityPolicyError as exc:  # pragma: no cover - handled via HTTP mapping
		raise _map_policy_error(exc) from None


@router.post("/verify/doc/presign", response_model=schemas.PresignResponse)
async def presign_verification_document(
	payload: schemas.VerificationDocPresignRequest,
	auth_user: AuthenticatedUser = Depends(get_current_user),
) -> schemas.PresignResponse:
	try:
		return await verification.presign_document(auth_user, payload)
	except policy.IdentityPolicyError as exc:  # pragma: no cover - handled via HTTP mapping
		raise _map_policy_error(exc) from None


@router.post("/verify/doc/submit", response_model=schemas.VerificationEntry)
async def submit_verification_document(
	payload: schemas.VerificationDocSubmit,
	auth_user: AuthenticatedUser = Depends(get_current_user),
) -> schemas.VerificationEntry:
	try:
		return await verification.submit_document(auth_user, payload)
	except policy.IdentityPolicyError as exc:  # pragma: no cover - handled via HTTP mapping
		raise _map_policy_error(exc) from None


@router.post("/verification/university/send-code", status_code=status.HTTP_204_NO_CONTENT)
async def send_university_code(
	payload: schemas.UniversityVerificationSendCode,
	auth_user: AuthenticatedUser = Depends(get_current_user),
	request: Request = None,
):
	"""Send a verification code to a university email."""
	from app.domain.identity import university_verification
	
	ip = request.client.host if request and request.client else "unknown"
	if not await rate_limit.allow("univ_send", str(auth_user.id), limit=3, window_seconds=600):
		raise HTTPException(status.HTTP_429_TOO_MANY_REQUESTS, detail="rate_limit_exceeded")

	try:
		await university_verification.send_code(auth_user, payload.email)
	except policy.IdentityPolicyError as exc:
		raise _map_policy_error(exc) from None


@router.post("/verification/university/confirm-code", status_code=status.HTTP_204_NO_CONTENT)
async def confirm_university_code(
	payload: schemas.UniversityVerificationConfirmCode,
	auth_user: AuthenticatedUser = Depends(get_current_user),
	request: Request = None,
):
	"""Confirm a university verification code."""
	from app.domain.identity import university_verification
	
	ip = request.client.host if request and request.client else "unknown"
	if not await rate_limit.allow("univ_confirm", str(auth_user.id), limit=10, window_seconds=600):
		raise HTTPException(status.HTTP_429_TOO_MANY_REQUESTS, detail="rate_limit_exceeded")

	try:
		await university_verification.confirm_code(auth_user, payload.code)
	except policy.IdentityPolicyError as exc:
		raise _map_policy_error(exc) from None
