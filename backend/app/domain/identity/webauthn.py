"""WebAuthn helper routines for passkey registration and authentication."""

from __future__ import annotations

import base64
import json
import secrets
from typing import Any, Dict, Optional

from asyncpg import Record

from app.domain.identity import attest, devices, models, policy, schemas, sessions
from app.infra.postgres import get_pool
from app.infra.redis import redis_client
from app.obs import metrics as obs_metrics
from app.settings import settings


def _b64encode(data: bytes) -> str:
    return base64.urlsafe_b64encode(data).rstrip(b"=").decode("ascii")


def _b64decode(data: str) -> bytes:
    padding = "=" * ((4 - len(data) % 4) % 4)
    return base64.urlsafe_b64decode(data + padding)


def _registration_key(user_id: str) -> str:
    return f"webauthn:reg:{user_id}"


def _auth_challenge_key(challenge_id: str) -> str:
    return f"webauthn:auth:{challenge_id}"


def _random_challenge(length: int = 32) -> bytes:
    return secrets.token_bytes(length)


async def _load_user(user_id: str) -> models.User:
    pool = await get_pool()
    async with pool.acquire() as conn:
        row: Optional[Record] = await conn.fetchrow("SELECT * FROM users WHERE id = $1", user_id)
    if not row:
        raise policy.IdentityPolicyError("user_not_found")
    return models.User.from_record(row)


async def _lookup_user(identifier: str) -> Optional[models.User]:
    pool = await get_pool()
    async with pool.acquire() as conn:
        if "@" in identifier:
            email = policy.normalise_email(identifier)
            row = await conn.fetchrow("SELECT * FROM users WHERE email = $1", email)
            if row:
                return models.User.from_record(row)
        handle = policy.normalise_handle(identifier)
        row = await conn.fetchrow("SELECT * FROM users WHERE handle = $1", handle)
    if row:
        return models.User.from_record(row)
    return None


def _user_entity(user: models.User) -> Dict[str, str]:
    identifier = str(user.id).encode("utf-8")
    return {
        "id": _b64encode(identifier),
        "name": user.email or user.handle or f"user-{user.id}",
        "displayName": user.display_name or user.handle or (user.email or "Divan user"),
    }


async def register_options(
    user: models.User,
    request: schemas.PasskeyRegisterOptionsRequest,
) -> Dict[str, Any]:
    await policy.enforce_passkey_register_rate(str(user.id))
    registered_credentials = await devices.list_passkey_credentials(str(user.id))
    challenge_bytes = _random_challenge()
    challenge_b64 = _b64encode(challenge_bytes)
    label = attest.sanitize_label(request.label, default=f"{user.handle or 'Device'}")
    payload = {
        "challenge": challenge_b64,
        "user_id": str(user.id),
        "label": label,
        "platform": request.platform or "auto",
    }
    await redis_client.set(
        _registration_key(str(user.id)),
        json.dumps(payload),
        ex=policy.PASSKEY_CHALLENGE_TTL_SECONDS,
    )
    options = {
        "rp": {"name": settings.webauthn_rp_name, "id": settings.webauthn_rp_id},
        "user": _user_entity(user),
        "challenge": challenge_bytes,
        "pubKeyCredParams": [
            {"type": "public-key", "alg": -7},
            {"type": "public-key", "alg": -257},
        ],
        "timeout": policy.PASSKEY_CHALLENGE_TTL_SECONDS * 1000,
        "attestation": "none",
        "authenticatorSelection": {
            "residentKey": "preferred",
            "requireResidentKey": False,
            "userVerification": "preferred",
            "authenticatorAttachment": request.platform,
        },
        "excludeCredentials": [
            {"type": "public-key", "id": _b64encode(cred)} for cred in registered_credentials
        ],
    }
    return {"publicKey": options}


async def register_verify(
    user: models.User,
    request: schemas.PasskeyRegisterVerifyRequest,
) -> schemas.PasskeyDevice:
    key = _registration_key(str(user.id))
    stored = await redis_client.get(key)
    if not stored:
        obs_metrics.inc_passkey_register("expired")
        raise policy.IdentityPolicyError("challenge_expired")
    data = json.loads(stored)
    challenge_expected = data.get("challenge")
    attestation = request.attestation_response
    challenge_received = attestation.get("challenge")
    if challenge_received != challenge_expected:
        obs_metrics.inc_passkey_register("mismatch")
        raise policy.IdentityPolicyError("challenge_mismatch")
    credential_b64 = attestation.get("credentialId")
    if not credential_b64:
        obs_metrics.inc_passkey_register("invalid")
        raise policy.IdentityPolicyError("credential_missing")
    public_key_b64 = attestation.get("publicKey")
    if not public_key_b64:
        obs_metrics.inc_passkey_register("invalid")
        raise policy.IdentityPolicyError("public_key_missing")
    credential_id = _b64decode(credential_b64)
    public_key = _b64decode(public_key_b64)
    fmt = attestation.get("attestationFormat") or "none"
    allow_direct = bool(attestation.get("allowDirect", False))
    attest.ensure_attestation_allowed(fmt, allow_direct=allow_direct)
    transports = attest.normalize_transports(attestation.get("transports"))
    counter = int(attestation.get("counter", 0))
    aaguid_raw = attestation.get("aaguid")
    try:
        device = await devices.create_passkey(
            str(user.id),
            credential_id=credential_id,
            public_key=public_key,
            aaguid=aaguid_raw,
            transports=transports,
            attestation_fmt=fmt,
            counter=counter,
            label=data.get("label", ""),
        )
    except policy.IdentityPolicyError:
        obs_metrics.inc_passkey_register("error")
        raise
    await redis_client.delete(key)
    obs_metrics.inc_passkey_register("ok")
    return device


async def auth_options(request: schemas.PasskeyAuthOptionsRequest) -> Dict[str, Any]:
    user: Optional[models.User] = None
    if request.username_or_email:
        user = await _lookup_user(request.username_or_email)
    if user:
        await policy.enforce_passkey_auth_rate(str(user.id))
        allow_credentials = [
            {"type": "public-key", "id": _b64encode(cred)}
            for cred in await devices.list_passkey_credentials(str(user.id))
        ]
    else:
        allow_credentials = []
    challenge_bytes = _random_challenge()
    challenge_b64 = _b64encode(challenge_bytes)
    marker = str(user.id) if user else None
    await redis_client.set(
        _auth_challenge_key(challenge_b64),
        json.dumps({"challenge": challenge_b64, "user_id": marker}),
        ex=policy.PASSKEY_CHALLENGE_TTL_SECONDS,
    )
    options = {
        "challenge": challenge_bytes,
        "rpId": settings.webauthn_rp_id,
        "timeout": policy.PASSKEY_CHALLENGE_TTL_SECONDS * 1000,
        "userVerification": "preferred",
        "allowCredentials": allow_credentials,
    }
    return {"challengeId": challenge_b64, "publicKey": options}


def _decode_user_handle(raw: str | None, fallback: Optional[str]) -> Optional[str]:
    if raw:
        try:
            decoded = _b64decode(raw).decode("utf-8")
            return decoded
        except Exception:  # pragma: no cover - guard against malformed handles
            return fallback
    return fallback


async def auth_verify(
    request: schemas.PasskeyAuthVerifyRequest,
    *,
    ip: Optional[str],
    user_agent: Optional[str],
    device_label: str = "",
    fingerprint: Optional[str] = None,
) -> schemas.LoginResponse:
    assertion = request.assertion_response
    challenge_id: Optional[str] = assertion.get("challengeId") or assertion.get("challenge")
    if not challenge_id:
        obs_metrics.inc_passkey_auth("invalid")
        raise policy.IdentityPolicyError("challenge_missing")
    stored_raw = await redis_client.get(_auth_challenge_key(challenge_id))
    if not stored_raw:
        obs_metrics.inc_passkey_auth("expired")
        raise policy.IdentityPolicyError("challenge_expired")
    stored = json.loads(stored_raw)
    if stored.get("challenge") != assertion.get("challenge") and stored.get("challenge") != challenge_id:
        obs_metrics.inc_passkey_auth("mismatch")
        raise policy.IdentityPolicyError("challenge_mismatch")
    credential_b64 = assertion.get("credentialId")
    if not credential_b64:
        obs_metrics.inc_passkey_auth("invalid")
        raise policy.IdentityPolicyError("credential_missing")
    credential_id = _b64decode(credential_b64)
    user_id = _decode_user_handle(assertion.get("userHandle"), stored.get("user_id"))
    if not user_id:
        obs_metrics.inc_passkey_auth("invalid")
        raise policy.IdentityPolicyError("user_missing")
    authenticator = await devices.fetch_passkey_by_credential(credential_id)
    if not authenticator:
        obs_metrics.inc_passkey_auth("unknown_cred")
        raise policy.IdentityPolicyError("credential_unknown")
    if str(authenticator.user_id) != str(user_id):
        obs_metrics.inc_passkey_auth("user_mismatch")
        raise policy.IdentityPolicyError("credential_mismatch")
    new_counter = int(assertion.get("newCounter", 0))
    if authenticator.counter and new_counter <= authenticator.counter:
        obs_metrics.inc_passkey_auth("replay")
        raise policy.IdentityPolicyError("counter_replay")
    await policy.enforce_passkey_auth_rate(user_id)
    await devices.update_passkey_usage(authenticator.id, counter=new_counter)
    user = await _load_user(user_id)
    response = await sessions.issue_session_tokens(
        user,
        ip=ip,
        user_agent=user_agent,
        device_label=device_label,
        fingerprint=fingerprint,
    )
    if not response.reauth_token:
        reauth_token = secrets.token_urlsafe(32)
        await policy.stash_reauth_token(str(user.id), reauth_token)
        response.reauth_token = reauth_token
    await devices.ensure_trusted_device(
        user_id,
        ip=ip,
        user_agent=user_agent,
        label=device_label,
    )
    await redis_client.delete(_auth_challenge_key(challenge_id))
    obs_metrics.inc_passkey_auth("ok")
    return response
