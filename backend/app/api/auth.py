"""Authentication and onboarding API endpoints.

Adds rate limits, cookie management for refresh flows, request id headers,
and refresh/logout endpoints (Phase A hardening).
"""

from __future__ import annotations

from fastapi import APIRouter, HTTPException, Request, Response, status
import secrets

from app.infra import rate_limit
from app.settings import settings  # noqa: F401 - may be used for future gating
from app.infra.cookies import set_refresh_cookies, clear_refresh_cookies
from app.api.request_id import get_request_id

from app.domain.identity import policy, schemas, service, recovery
from app.obs import metrics as obs_metrics

router = APIRouter()


def _client_ip(request: Request) -> str:
	client = request.client
	return client.host if client else "unknown"


def _raise(detail: str, status_code: int) -> None:
	"""Raise an HTTP error with request id header attached."""
	raise HTTPException(status_code=status_code, detail=detail, headers={"X-Request-Id": get_request_id()})


def _map_policy_error(exc: policy.IdentityPolicyError) -> HTTPException:
	obs_metrics.inc_identity_reject(exc.reason)
	if isinstance(exc, policy.IdentityRateLimitExceeded):
		return HTTPException(status.HTTP_429_TOO_MANY_REQUESTS, detail=exc.reason)
	if isinstance(exc, policy.HandleConflict) or isinstance(exc, policy.EmailConflict):
		return HTTPException(status.HTTP_409_CONFLICT, detail=exc.reason)
	if isinstance(exc, policy.HandleFormatError) or isinstance(exc, policy.PasswordTooWeak):
		return HTTPException(status.HTTP_400_BAD_REQUEST, detail=exc.reason)
	if isinstance(exc, policy.EmailDomainMismatch):
		return HTTPException(status.HTTP_400_BAD_REQUEST, detail=exc.reason)
	return HTTPException(status.HTTP_400_BAD_REQUEST, detail=exc.reason)


@router.post("/auth/register", response_model=schemas.RegisterResponse)
async def register(payload: schemas.RegisterRequest, request: Request, response: Response) -> schemas.RegisterResponse:
	ip = _client_ip(request)
	email_key = payload.email.lower().strip() if getattr(payload, "email", None) else ip
	limit_ip = 500 if settings.is_dev() else 5
	if not await rate_limit.allow("register:ip", ip, limit=limit_ip, window_seconds=60):
		_raise("rate_limited_ip", status.HTTP_429_TOO_MANY_REQUESTS)
	limit_email = 200 if settings.is_dev() else 2
	if not await rate_limit.allow("register:email", email_key, limit=limit_email, window_seconds=60):
		_raise("rate_limited_email", status.HTTP_429_TOO_MANY_REQUESTS)
	try:
		res = await service.register(payload, ip_address=ip)
		response.headers["X-Request-Id"] = get_request_id()
		return res
	except policy.IdentityPolicyError as exc:
		raise _map_policy_error(exc) from None
	except service.IdentityServiceError as exc:
		obs_metrics.inc_identity_reject(exc.reason)
		_raise(exc.reason, exc.status_code)


@router.post("/auth/login", response_model=schemas.LoginResponse)
async def login(payload: schemas.LoginRequest, request: Request, response: Response) -> schemas.LoginResponse:
	ip = _client_ip(request)
	# payload.email is required by schema, so we can use it directly.
	# If handle login is added later, update schema and use getattr(payload, "handle", None).
	ident = payload.email.lower().strip() if payload.email else ip
	limit_ip = 1000 if settings.is_dev() else 10
	if not await rate_limit.allow("login:ip", ip, limit=limit_ip, window_seconds=60):
		_raise("rate_limited_ip", status.HTTP_429_TOO_MANY_REQUESTS)
	limit_id = 500 if settings.is_dev() else 5
	if not await rate_limit.allow("login:id", ident, limit=limit_id, window_seconds=60):
		_raise("rate_limited_id", status.HTTP_429_TOO_MANY_REQUESTS)
	try:
		device_label = payload.device_label or request.headers.get("X-Device-Label", "")
		pair = await service.login(
			payload,
			ip=ip,
			user_agent=request.headers.get("User-Agent"),
			device_label=device_label,
		)
		rf_fp = secrets.token_urlsafe(24)
		set_refresh_cookies(response, refresh_token=pair.refresh_token, rf_fp=rf_fp)
		pair.refresh_token = ""  # avoid echoing refresh token back in body
		rid = get_request_id(request)
		response.headers["X-Request-Id"] = rid
		# Populate optional request_id in body for FE convenience
		if hasattr(pair, "request_id"):
			pair.request_id = rid
		return pair
	except policy.IdentityPolicyError as exc:
		raise _map_policy_error(exc) from None
	except service.LoginFailed as exc:
		obs_metrics.inc_identity_reject(exc.reason)
		_raise(exc.reason, exc.status_code)


@router.post("/auth/verify-email", response_model=schemas.VerificationStatus)
async def verify_email(payload: schemas.VerifyRequest, response: Response) -> schemas.VerificationStatus:
	try:
		res = await service.verify_email(payload)
		response.headers["X-Request-Id"] = get_request_id()
		return res
	except service.VerificationError as exc:
		obs_metrics.inc_identity_reject(exc.reason)
		_raise(exc.reason, exc.status_code)


@router.post("/auth/resend")
async def resend_verification(payload: schemas.ResendRequest, response: Response) -> dict:
	try:
		await service.resend_verification(payload)
		response.headers["X-Request-Id"] = get_request_id()
	except policy.IdentityPolicyError as exc:
		raise _map_policy_error(exc) from None
	except service.IdentityServiceError as exc:
		obs_metrics.inc_identity_reject(exc.reason)
		_raise(exc.reason, exc.status_code)
	return {"status": "ok"}

@router.post("/auth/refresh", response_model=schemas.LoginResponse)
async def refresh(request: Request, response: Response, payload: schemas.RefreshRequest) -> schemas.LoginResponse:
	ip = _client_ip(request)
	if not await rate_limit.allow("refresh:ip", ip, limit=30, window_seconds=60):
		_raise("rate_limited_ip", status.HTTP_429_TOO_MANY_REQUESTS)
	rf_fp = request.cookies.get("rf_fp") or ""
	refresh_cookie = request.cookies.get("refresh_token") or ""
	try:
		pair = await service.refresh(
			payload,
			ip=ip,
			user_agent=request.headers.get("User-Agent"),
			fingerprint=rf_fp,
			refresh_cookie=refresh_cookie,
		)
		# maintain fingerprint or rotate if missing
		new_fp = rf_fp or secrets.token_urlsafe(24)
		set_refresh_cookies(response, refresh_token=pair.refresh_token, rf_fp=new_fp)
		pair.refresh_token = ""
		rid = get_request_id(request)
		response.headers["X-Request-Id"] = rid
		if hasattr(pair, "request_id"):
			pair.request_id = rid
		return pair
	except policy.IdentityPolicyError as exc:
		raise _map_policy_error(exc) from None
	except service.IdentityServiceError as exc:
		obs_metrics.inc_identity_reject(exc.reason)
		_raise(exc.reason, exc.status_code)

@router.post("/auth/logout")
async def logout(request: Request, response: Response, payload: schemas.LogoutRequest) -> dict:
	try:
		await service.logout(payload)
		clear_refresh_cookies(response)
		response.headers["X-Request-Id"] = get_request_id()
		return {"status": "ok"}
	except policy.IdentityPolicyError as exc:
		raise _map_policy_error(exc) from None
	except service.IdentityServiceError as exc:
		obs_metrics.inc_identity_reject(exc.reason)
		_raise(exc.reason, exc.status_code)


@router.get("/auth/campuses", response_model=list[schemas.CampusOut])
async def list_campuses() -> list[schemas.CampusOut]:
	return await service.list_campuses()

@router.post("/auth/forgot-password", status_code=status.HTTP_202_ACCEPTED)
async def forgot_password(payload: schemas.ForgotPasswordRequest, request: Request):
	try:
		await recovery.request_password_reset(payload.email)
	except policy.IdentityPolicyError as exc:
		raise _map_policy_error(exc) from None
	return {"detail": "If an account exists, an email has been sent."}


@router.post("/auth/forgot-username", status_code=status.HTTP_202_ACCEPTED)
async def forgot_username(payload: schemas.ForgotUsernameRequest, request: Request):
	try:
		await recovery.request_username_recovery(payload.email)
	except policy.IdentityPolicyError as exc:
		raise _map_policy_error(exc) from None
	return {"detail": "If an account exists, an email has been sent."}


@router.post("/auth/reset-password")
async def reset_password(payload: schemas.PasswordResetConsume, request: Request):
	ip = _client_ip(request)
	try:
		await recovery.consume_password_reset(payload.token, payload.new_password, ip=ip)
	except policy.IdentityPolicyError as exc:
		raise _map_policy_error(exc) from None
	return {"detail": "Password reset successfully."}
