"""Two-factor authentication helpers (TOTP + recovery codes)."""

from __future__ import annotations

import base64
import io
import json
import secrets
from datetime import datetime, timezone
from typing import Optional

import asyncpg
import pyotp
import qrcode
from argon2 import exceptions as argon_exc

from app.domain.identity import audit, models, policy, schemas, sessions
from app.infra.password import PASSWORD_HASHER
from app.infra.postgres import get_pool
from app.infra.redis import redis_client

RECOVERY_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"
RECOVERY_COUNT = policy.RECOVERY_CODES_COUNT
RECOVERY_LEN = policy.RECOVERY_CODE_LEN
CHALLENGE_TTL_SECONDS = 300
ISSUER_NAME = "Divan"

_PASSWORD_HASHER = PASSWORD_HASHER


def _now() -> datetime:
	return datetime.now(timezone.utc)


def _challenge_key(challenge_id: str) -> str:
	return f"otp:2fa:challenge:{challenge_id}"


def _generate_secret() -> str:
	return pyotp.random_base32()


def _identifier_for(user: models.User) -> str:
	return user.email or user.handle or f"user-{user.id}"


def _totp(secret: str) -> pyotp.TOTP:
	return pyotp.TOTP(secret, interval=policy.TOTP_PERIOD_S)


def _qr_data_url(uri: str) -> str:
	img = qrcode.make(uri)
	buffer = io.BytesIO()
	img.save(buffer, format="PNG")
	encoded = base64.b64encode(buffer.getvalue()).decode("ascii")
	return f"data:image/png;base64,{encoded}"


def _random_code() -> str:
	return "".join(secrets.choice(RECOVERY_ALPHABET) for _ in range(RECOVERY_LEN))


def _normalise_code(code: str | None) -> Optional[str]:
	if code is None:
		return None
	return code.strip().replace(" ", "").upper()


async def _fetch_twofa(conn: asyncpg.Connection, user_id: str) -> Optional[asyncpg.Record]:
	return await conn.fetchrow("SELECT * FROM twofa WHERE user_id = $1", user_id)


async def enroll(user: models.User) -> schemas.TwoFAEnrollResponse:
	secret = _generate_secret()
	identifier = _identifier_for(user)
	totp = _totp(secret)
	otpauth_uri = totp.provisioning_uri(name=identifier, issuer_name=ISSUER_NAME)
	qr_url = _qr_data_url(otpauth_uri)
	pool = await get_pool()
	async with pool.acquire() as conn:
		await conn.execute(
			"""
			INSERT INTO twofa (user_id, secret, enabled, created_at, last_verified_at)
			VALUES ($1, $2, FALSE, NOW(), NULL)
			ON CONFLICT (user_id)
			DO UPDATE SET secret = EXCLUDED.secret, enabled = FALSE, created_at = NOW(), last_verified_at = NULL
			""",
			str(user.id),
			secret,
		)
		await conn.execute("DELETE FROM recovery_codes WHERE user_id = $1", str(user.id))
	audit.inc_twofa_enroll()
	await audit.log_event("2fa_enroll", user_id=str(user.id), meta={"identifier": identifier})
	return schemas.TwoFAEnrollResponse(secret=secret, otpauth_uri=otpauth_uri, qr_data_url=qr_url)


async def enable(user: models.User, code: str) -> schemas.RecoveryCodesResponse:
	norm_code = _normalise_code(code)
	if not norm_code:
		raise policy.IdentityPolicyError("twofa_code_required")
	await policy.enforce_twofa_verify_rate(str(user.id))
	pool = await get_pool()
	async with pool.acquire() as conn:
		record = await _fetch_twofa(conn, str(user.id))
		if not record:
			raise policy.IdentityPolicyError("twofa_not_enrolled")
		if record["enabled"]:
			raise policy.TwoFAAlreadyEnabled("twofa_enabled")
		secret = record["secret"]
		totp = _totp(secret)
		if not totp.verify(norm_code, valid_window=1):
			audit.inc_twofa_verify("invalid")
			raise policy.IdentityPolicyError("twofa_code_invalid")
		codes = []
		hashes = []
		for _ in range(RECOVERY_COUNT):
			code_plain = _random_code()
			codes.append(code_plain)
			hashes.append(_PASSWORD_HASHER.hash(code_plain))
		async with conn.transaction():
			await conn.execute(
				"""
				UPDATE twofa
				SET enabled = TRUE, last_verified_at = NOW()
				WHERE user_id = $1
				""",
				str(user.id),
			)
			await conn.execute("DELETE FROM recovery_codes WHERE user_id = $1", str(user.id))
			for hashed in hashes:
				await conn.execute(
					"""
					INSERT INTO recovery_codes (user_id, code_hash)
					VALUES ($1, $2)
					""",
					str(user.id),
					hashed,
				)
	audit.inc_twofa_enable()
	audit.inc_twofa_verify("ok")
	await audit.log_event("2fa_enabled", user_id=str(user.id), meta={"codes": "issued"})
	return schemas.RecoveryCodesResponse(codes=codes)


async def status(user_id: str) -> schemas.TwoFAStatus:
	pool = await get_pool()
	async with pool.acquire() as conn:
		record = await _fetch_twofa(conn, user_id)
	if not record:
		return schemas.TwoFAStatus(enabled=False)
	return schemas.TwoFAStatus(
		enabled=bool(record["enabled"]),
		created_at=record["created_at"],
		last_verified_at=record.get("last_verified_at"),
	)


async def _consume_recovery_code(conn: asyncpg.Connection, user_id: str, code: str) -> bool:
	rows = await conn.fetch(
		"SELECT code_hash FROM recovery_codes WHERE user_id = $1 AND used_at IS NULL",
		user_id,
	)
	for row in rows:
		hash_value = row["code_hash"]
		try:
			_PASSWORD_HASHER.verify(hash_value, code)
		except argon_exc.VerifyMismatchError:
			continue
		else:
			await conn.execute(
				"""
				UPDATE recovery_codes
				SET used_at = NOW()
				WHERE user_id = $1 AND code_hash = $2
				""",
				user_id,
				hash_value,
			)
			return True
	return False


async def _load_user(conn: asyncpg.Connection, user_id: str) -> models.User:
	row = await conn.fetchrow("SELECT * FROM users WHERE id = $1", user_id)
	if not row:
		raise policy.IdentityPolicyError("user_missing")
	return models.User.from_record(row)


async def create_challenge(
	user: models.User,
	*,
	ip: Optional[str],
	user_agent: Optional[str],
	device_label: str = "",
	fingerprint: Optional[str] = None,
) -> str:
	challenge_id = secrets.token_urlsafe(24)
	payload = {
		"user_id": str(user.id),
		"ip": ip,
		"ua": user_agent,
		"label": device_label,
		"fp": fingerprint,
	}
	await redis_client.set(_challenge_key(challenge_id), json.dumps(payload), ex=CHALLENGE_TTL_SECONDS)
	await audit.log_event("2fa_challenge", user_id=str(user.id), meta={"challenge_id": challenge_id})
	return challenge_id


async def verify_challenge(challenge_id: str, *, code: str | None, recovery_code: str | None) -> schemas.LoginResponse:
	stored = await redis_client.get(_challenge_key(challenge_id))
	if not stored:
		raise policy.IdentityPolicyError("challenge_expired")
	data = json.loads(stored)
	user_id = data.get("user_id")
	if not user_id:
		raise policy.IdentityPolicyError("challenge_invalid")
	norm_code = _normalise_code(code)
	recovery = _normalise_code(recovery_code)
	if not norm_code and not recovery:
		raise policy.IdentityPolicyError("twofa_code_required")
	await policy.enforce_twofa_verify_rate(user_id)
	pool = await get_pool()
	async with pool.acquire() as conn:
		record = await _fetch_twofa(conn, user_id)
		if not record or not record["enabled"]:
			raise policy.TwoFANotEnabled("twofa_disabled")
		secret = record["secret"]
		verified = False
		if norm_code:
			totp = _totp(secret)
			if totp.verify(norm_code, valid_window=1):
				verified = True
		else:
			recovery = recovery or ""
		if not verified and recovery:
			if await _consume_recovery_code(conn, user_id, recovery):
				verified = True
			else:
				raise policy.RecoveryCodeInvalid("recovery_invalid")
		if not verified:
			audit.inc_twofa_verify("invalid")
			raise policy.IdentityPolicyError("twofa_code_invalid")
		await conn.execute(
			"""
			UPDATE twofa
			SET last_verified_at = NOW()
			WHERE user_id = $1
			""",
			user_id,
		)
		user = await _load_user(conn, user_id)
	result = await sessions.issue_session_tokens(
		user,
		ip=data.get("ip"),
		user_agent=data.get("ua"),
		device_label=data.get("label", ""),
		fingerprint=data.get("fp"),
	)
	await redis_client.delete(_challenge_key(challenge_id))
	audit.inc_twofa_verify("ok")
	await audit.log_event("2fa_verified", user_id=user_id, meta={"challenge_id": challenge_id})
	return result


async def disable(user: models.User, *, code: str | None, recovery_code: str | None) -> None:
	pool = await get_pool()
	async with pool.acquire() as conn:
		record = await _fetch_twofa(conn, str(user.id))
		if not record or not record["enabled"]:
			raise policy.TwoFANotEnabled("twofa_disabled")
		secret = record["secret"]
		norm_code = _normalise_code(code)
		recovery = _normalise_code(recovery_code)
		if not norm_code and not recovery:
			raise policy.IdentityPolicyError("twofa_code_required")
		await policy.enforce_twofa_verify_rate(str(user.id))
		verified = False
		if norm_code:
			totp = _totp(secret)
			if totp.verify(norm_code, valid_window=1):
				verified = True
		if not verified and recovery:
			if await _consume_recovery_code(conn, str(user.id), recovery):
				verified = True
			else:
				raise policy.RecoveryCodeInvalid("recovery_invalid")
		if not verified:
			audit.inc_twofa_verify("invalid")
			raise policy.IdentityPolicyError("twofa_code_invalid")
		async with conn.transaction():
			await conn.execute(
				"""
				UPDATE twofa
				SET enabled = FALSE
				WHERE user_id = $1
				""",
				str(user.id),
			)
			await conn.execute("DELETE FROM recovery_codes WHERE user_id = $1", str(user.id))
	await sessions.revoke_all_sessions(str(user.id))
	await audit.log_event("2fa_disabled", user_id=str(user.id), meta={})
