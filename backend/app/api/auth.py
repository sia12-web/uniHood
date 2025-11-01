"""Authentication and onboarding API endpoints."""

from __future__ import annotations

from fastapi import APIRouter, HTTPException, Request, status

from app.domain.identity import policy, schemas, service
from app.obs import metrics as obs_metrics

router = APIRouter()


def _client_ip(request: Request) -> str:
	client = request.client
	return client.host if client else "unknown"


def _raise(detail: str, status_code: int) -> None:
	raise HTTPException(status_code=status_code, detail=detail)


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
async def register(payload: schemas.RegisterRequest, request: Request) -> schemas.RegisterResponse:
	ip_address = _client_ip(request)
	try:
		return await service.register(payload, ip_address=ip_address)
	except policy.IdentityPolicyError as exc:
		raise _map_policy_error(exc) from None
	except service.IdentityServiceError as exc:
		obs_metrics.inc_identity_reject(exc.reason)
		_raise(exc.reason, exc.status_code)


@router.post("/auth/login", response_model=schemas.LoginResponse)
async def login(payload: schemas.LoginRequest, request: Request) -> schemas.LoginResponse:
	try:
		device_label = payload.device_label or request.headers.get("X-Device-Label", "")
		return await service.login(
			payload,
			ip=_client_ip(request),
			user_agent=request.headers.get("User-Agent"),
			device_label=device_label,
		)
	except policy.IdentityPolicyError as exc:
		raise _map_policy_error(exc) from None
	except service.LoginFailed as exc:
		obs_metrics.inc_identity_reject(exc.reason)
		_raise(exc.reason, exc.status_code)


@router.post("/auth/verify-email", response_model=schemas.VerificationStatus)
async def verify_email(payload: schemas.VerifyRequest) -> schemas.VerificationStatus:
	try:
		return await service.verify_email(payload)
	except service.VerificationError as exc:
		obs_metrics.inc_identity_reject(exc.reason)
		_raise(exc.reason, exc.status_code)


@router.post("/auth/resend")
async def resend_verification(payload: schemas.ResendRequest) -> dict:
	try:
		await service.resend_verification(payload)
	except policy.IdentityPolicyError as exc:
		raise _map_policy_error(exc) from None
	except service.IdentityServiceError as exc:
		obs_metrics.inc_identity_reject(exc.reason)
		_raise(exc.reason, exc.status_code)
	return {"status": "ok"}


@router.get("/auth/campuses", response_model=list[schemas.CampusOut])
async def list_campuses() -> list[schemas.CampusOut]:
	return await service.list_campuses()
