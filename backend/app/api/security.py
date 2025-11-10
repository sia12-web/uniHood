"""Security endpoints for sessions, 2FA, and password reset."""

from __future__ import annotations

import json
import secrets

from fastapi import APIRouter, Depends, HTTPException, Request, status

from app.domain.identity import policy, schemas, service, sessions, twofa
from app.domain.identity.models import User
from app.infra.auth import AuthenticatedUser, get_current_user
from app.infra.redis import redis_client
from app.infra.postgres import get_pool

router = APIRouter()


def _client_ip(request: Request) -> str:
	client = request.client
	return client.host if client else "unknown"


async def _load_user(auth_user: AuthenticatedUser) -> User:
	pool = await get_pool()
	async with pool.acquire() as conn:
		row = await conn.fetchrow("SELECT * FROM users WHERE id = $1", auth_user.id)
	if not row:
		raise HTTPException(status.HTTP_404_NOT_FOUND, detail="user_not_found")
	return User.from_record(row)


def _map_policy_error(exc: policy.IdentityPolicyError) -> HTTPException:
	if isinstance(exc, policy.IdentityRateLimitExceeded):
		return HTTPException(status.HTTP_429_TOO_MANY_REQUESTS, detail=exc.reason)
	if isinstance(exc, policy.TwoFAAlreadyEnabled):
		return HTTPException(status.HTTP_409_CONFLICT, detail=exc.reason)
	if isinstance(exc, policy.TwoFANotEnabled):
		return HTTPException(status.HTTP_409_CONFLICT, detail=exc.reason)
	return HTTPException(status.HTTP_400_BAD_REQUEST, detail=exc.reason)


@router.get("/security/sessions", response_model=list[schemas.SessionRow])
async def list_user_sessions(auth_user: AuthenticatedUser = Depends(get_current_user)) -> list[schemas.SessionRow]:
	records = await sessions.list_sessions(auth_user.id)
	rows: list[schemas.SessionRow] = []
	for record, risk_record in records:
		rows.append(
			schemas.SessionRow(
				id=record.id,
				created_at=record.created_at,
				last_used_at=record.last_used_at,
				ip=record.ip,
				user_agent=record.user_agent,
				device_label=record.device_label,
				revoked=record.revoked,
				risk_score=risk_record.risk_score if risk_record else None,
				risk_reasons=risk_record.reasons if risk_record else [],
				step_up_required=risk_record.step_up_required if risk_record else False,
			),
		)
	return rows


@router.post("/security/sessions/label")
async def label_session(
	payload: schemas.SessionLabelRequest,
	auth_user: AuthenticatedUser = Depends(get_current_user),
) -> dict:
	try:
		await sessions.set_session_label(auth_user.id, payload.session_id, payload.device_label)
	except policy.IdentityPolicyError as exc:
		raise _map_policy_error(exc) from None
	return {"status": "ok"}


@router.post("/security/sessions/revoke")
async def revoke_session(
	payload: schemas.SessionRevokeRequest,
	auth_user: AuthenticatedUser = Depends(get_current_user),
) -> dict:
	try:
		await sessions.revoke_session(auth_user.id, payload.session_id)
	except policy.IdentityPolicyError as exc:
		raise _map_policy_error(exc) from None
	return {"status": "ok"}


@router.post("/security/sessions/revoke_all")
async def revoke_all_sessions(auth_user: AuthenticatedUser = Depends(get_current_user)) -> dict:
	await sessions.revoke_all_sessions(auth_user.id)
	return {"status": "ok"}


@router.post("/realtime/ticket")
async def issue_realtime_ticket(auth_user: AuthenticatedUser = Depends(get_current_user)) -> dict:
	session_id = auth_user.session_id
	if not session_id:
		raise HTTPException(status.HTTP_400_BAD_REQUEST, detail="missing_session")
	token = secrets.token_urlsafe(24)
	payload = {
		"user_id": auth_user.id,
		"campus_id": auth_user.campus_id,
		"session_id": session_id,
	}
	if auth_user.handle:
		payload["handle"] = auth_user.handle
	await redis_client.setex(f"rticket:{token}", 60, json.dumps(payload, separators=(",", ":")))
	return {"ticket": token}


@router.get("/security/2fa/status", response_model=schemas.TwoFAStatus)
async def twofa_status(auth_user: AuthenticatedUser = Depends(get_current_user)) -> schemas.TwoFAStatus:
	return await twofa.status(auth_user.id)


@router.post("/security/2fa/enroll", response_model=schemas.TwoFAEnrollResponse)
async def twofa_enroll(auth_user: AuthenticatedUser = Depends(get_current_user)) -> schemas.TwoFAEnrollResponse:
	user = await _load_user(auth_user)
	try:
		return await twofa.enroll(user)
	except policy.IdentityPolicyError as exc:
		raise _map_policy_error(exc) from None


@router.post("/security/2fa/enable", response_model=schemas.RecoveryCodesResponse)
async def twofa_enable(
	payload: schemas.TwoFAEnableRequest,
	auth_user: AuthenticatedUser = Depends(get_current_user),
) -> schemas.RecoveryCodesResponse:
	user = await _load_user(auth_user)
	try:
		return await twofa.enable(user, payload.code)
	except policy.IdentityPolicyError as exc:
		raise _map_policy_error(exc) from None


@router.post("/security/2fa/verify", response_model=schemas.LoginResponse)
async def twofa_verify(payload: schemas.TwoFAVerifyRequest) -> schemas.LoginResponse:
	try:
		return await twofa.verify_challenge(
			payload.challenge_id,
			code=payload.code,
			recovery_code=payload.recovery_code,
		)
	except policy.IdentityPolicyError as exc:
		raise _map_policy_error(exc) from None


@router.post("/security/2fa/disable")
async def twofa_disable(
	payload: schemas.TwoFADisableRequest,
	auth_user: AuthenticatedUser = Depends(get_current_user),
) -> dict:
	user = await _load_user(auth_user)
	try:
		await twofa.disable(user, code=payload.code, recovery_code=payload.recovery_code)
	except policy.IdentityPolicyError as exc:
		raise _map_policy_error(exc) from None
	return {"status": "ok"}


@router.post("/security/password/reset/request")
async def password_reset_request(payload: schemas.PasswordResetRequest) -> dict:
	try:
		await service.request_password_reset(payload)
	except policy.IdentityPolicyError as exc:
		raise _map_policy_error(exc) from None
	return {"status": "ok"}


@router.post("/security/password/reset/consume")
async def password_reset_consume(payload: schemas.PasswordResetConsume, request: Request) -> dict:
	ip = _client_ip(request)
	try:
		await service.consume_password_reset(payload, ip=ip)
	except policy.IdentityPolicyError as exc:
		raise _map_policy_error(exc) from None
	return {"status": "ok"}
