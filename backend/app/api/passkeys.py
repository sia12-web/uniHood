"""Passkey (WebAuthn) registration, authentication, and device management API."""

from __future__ import annotations

import secrets
from typing import Optional
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Request, Response, status

from app.domain.identity import devices, models, policy, schemas, webauthn
from app.infra.auth import AuthenticatedUser, get_current_user
from app.infra.postgres import get_pool
from app.api.auth import set_refresh_cookies

router = APIRouter(prefix="/passkeys", tags=["passkeys"])


def _client_ip(request: Request) -> str:
    client = request.client
    return client.host if client else "unknown"


async def _load_user(auth_user: AuthenticatedUser) -> models.User:
    pool = await get_pool()
    async with pool.acquire() as conn:
        row = await conn.fetchrow("SELECT * FROM users WHERE id = $1", auth_user.id)
    if not row:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="user_not_found")
    return models.User.from_record(row)


def _map_policy_error(exc: policy.IdentityPolicyError) -> HTTPException:
    reason = getattr(exc, "reason", "invalid")
    if isinstance(exc, policy.IdentityRateLimitExceeded):
        return HTTPException(status.HTTP_429_TOO_MANY_REQUESTS, detail=reason)
    if reason in {"passkey_not_found", "trusted_device_not_found", "user_not_found", "credential_unknown"}:
        return HTTPException(status.HTTP_404_NOT_FOUND, detail=reason)
    if reason in {"passkey_exists"}:
        return HTTPException(status.HTTP_409_CONFLICT, detail=reason)
    return HTTPException(status.HTTP_400_BAD_REQUEST, detail=reason)


@router.post("/register/options")
async def begin_passkey_registration(
    request: Request,
    payload: Optional[schemas.PasskeyRegisterOptionsRequest] = None,
    auth_user: AuthenticatedUser = Depends(get_current_user),
) -> dict:
    user = await _load_user(auth_user)
    try:
        options = await webauthn.register_options(user, payload or schemas.PasskeyRegisterOptionsRequest())
    except policy.IdentityPolicyError as exc:
        raise _map_policy_error(exc) from None
    return options


@router.post("/register/verify", response_model=schemas.PasskeyDevice)
async def complete_passkey_registration(
    payload: schemas.PasskeyRegisterVerifyRequest,
    auth_user: AuthenticatedUser = Depends(get_current_user),
) -> schemas.PasskeyDevice:
    user = await _load_user(auth_user)
    try:
        return await webauthn.register_verify(user, payload)
    except policy.IdentityPolicyError as exc:
        raise _map_policy_error(exc) from None


@router.get("/mine", response_model=list[schemas.PasskeyDevice])
async def list_my_passkeys(auth_user: AuthenticatedUser = Depends(get_current_user)) -> list[schemas.PasskeyDevice]:
    return await devices.list_passkeys(auth_user.id)


@router.post("/mine/{device_id}/label", response_model=schemas.PasskeyDevice)
async def label_passkey(
    device_id: UUID,
    payload: schemas.PasskeyLabelRequest,
    auth_user: AuthenticatedUser = Depends(get_current_user),
) -> schemas.PasskeyDevice:
    try:
        await devices.set_passkey_label(auth_user.id, device_id, payload.label.strip())
    except policy.IdentityPolicyError as exc:
        raise _map_policy_error(exc) from None
    devices_list = await devices.list_passkeys(auth_user.id)
    for item in devices_list:
        if item.id == device_id:
            return item
    raise HTTPException(status.HTTP_404_NOT_FOUND, detail="passkey_not_found")


@router.delete("/mine/{device_id}")
async def delete_passkey(
    device_id: UUID,
    payload: schemas.PasskeyRemoveRequest,
    auth_user: AuthenticatedUser = Depends(get_current_user),
) -> dict:
    try:
        await policy.verify_recent_reauth(auth_user.id, payload.reauth_token)
        await devices.remove_passkey(auth_user.id, device_id)
    except policy.IdentityPolicyError as exc:
        raise _map_policy_error(exc) from None
    return {"status": "ok"}


@router.post("/auth/options")
async def passkey_auth_options(payload: Optional[schemas.PasskeyAuthOptionsRequest] = None) -> dict:
    try:
        return await webauthn.auth_options(payload or schemas.PasskeyAuthOptionsRequest())
    except policy.IdentityPolicyError as exc:
        raise _map_policy_error(exc) from None


@router.post("/auth/verify", response_model=schemas.LoginResponse)
async def passkey_auth_verify(
    request: Request,
    response: Response,
    payload: schemas.PasskeyAuthVerifyRequest,
) -> schemas.LoginResponse:
    ip = _client_ip(request)
    user_agent = request.headers.get("User-Agent")
    device_label = request.headers.get("X-Device-Label", "")
    rf_fp = secrets.token_urlsafe(24)
    try:
        result = await webauthn.auth_verify(
            payload,
            ip=ip,
            user_agent=user_agent,
            device_label=device_label,
            fingerprint=rf_fp,
        )
        set_refresh_cookies(response, refresh_token=result.refresh_token, rf_fp=rf_fp)
        result.refresh_token = ""  # don't echo in body
        return result
    except policy.IdentityPolicyError as exc:
        raise _map_policy_error(exc) from None


@router.get("/devices/mine", response_model=list[schemas.TrustedDevice])
async def list_trusted_devices_endpoint(auth_user: AuthenticatedUser = Depends(get_current_user)) -> list[schemas.TrustedDevice]:
    return await devices.list_trusted_devices(auth_user.id)


@router.post("/devices/label")
async def label_trusted_device(
    payload: schemas.TrustedDeviceLabelRequest,
    auth_user: AuthenticatedUser = Depends(get_current_user),
) -> dict:
    try:
        await devices.set_trusted_device_label(auth_user.id, payload.device_id, payload.label.strip())
    except policy.IdentityPolicyError as exc:
        raise _map_policy_error(exc) from None
    return {"status": "ok"}


@router.post("/devices/revoke")
async def revoke_trusted_device_endpoint(
    payload: schemas.TrustedDeviceRevokeRequest,
    auth_user: AuthenticatedUser = Depends(get_current_user),
) -> dict:
    try:
        await policy.verify_recent_reauth(auth_user.id, payload.reauth_token)
        await devices.revoke_trusted_device(auth_user.id, payload.device_id)
    except policy.IdentityPolicyError as exc:
        raise _map_policy_error(exc) from None
    return {"status": "ok"}


@router.post("/devices/revoke_all")
async def revoke_all_trusted_devices_endpoint(
    payload: schemas.TrustedDeviceRevokeAllRequest,
    auth_user: AuthenticatedUser = Depends(get_current_user),
) -> dict:
    try:
        await policy.verify_recent_reauth(auth_user.id, payload.reauth_token)
        await devices.revoke_all_trusted_devices(auth_user.id)
    except policy.IdentityPolicyError as exc:
        raise _map_policy_error(exc) from None
    return {"status": "ok"}
