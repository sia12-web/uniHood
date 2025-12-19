"""Password reset flows for identity security."""

from __future__ import annotations

import secrets
from datetime import datetime, timedelta, timezone
from typing import Optional
from uuid import UUID, uuid4

import asyncpg

from app.domain.identity import audit, mailer, policy, sessions
from app.infra.password import PASSWORD_HASHER
from app.infra.postgres import get_pool
from app.settings import settings

_PASSWORD_HASHER = PASSWORD_HASHER
_FRONTEND_URL = settings.public_app_url


def _now() -> datetime:
	return datetime.now(timezone.utc)


def _expiry() -> datetime:
	return _now() + timedelta(minutes=policy.PWRESET_TTL_MINUTES)


async def _find_user(conn: asyncpg.Connection, email: str) -> Optional[asyncpg.Record]:
	return await conn.fetchrow("SELECT id, email FROM users WHERE email = $1", email)


async def _delete_open_tokens(conn: asyncpg.Connection, user_id: UUID) -> None:
	await conn.execute("DELETE FROM password_resets WHERE user_id = $1 AND used_at IS NULL", user_id)


async def request_password_reset(email: str) -> None:
	normalised = policy.normalise_email(email)
	await policy.enforce_pwreset_request_rate(normalised)
	pool = await get_pool()
	async with pool.acquire() as conn:
		user = await _find_user(conn, normalised)
		if not user:
			audit.inc_pwreset_request()
			await audit.log_event("pwreset_request", meta={"email_hash": normalised[:2] + "***"})
			return
		user_id = user["id"]
		token = secrets.token_urlsafe(48)
		reset_id = uuid4()
		async with conn.transaction():
			await _delete_open_tokens(conn, user_id)
			await conn.execute(
				"""
				INSERT INTO password_resets (id, user_id, token, expires_at)
				VALUES ($1, $2, $3, $4)
				""",
				reset_id,
				user_id,
				token,
				_expiry(),
			)
	audit.inc_pwreset_request()
	await audit.log_event("pwreset_request", user_id=str(user_id), meta={"reset_id": str(reset_id)})
	link = f"{_FRONTEND_URL}/reset-password?token={token}"
	await mailer.send_password_reset(normalised, link, user_id=str(user_id))


async def consume_password_reset(token: str, new_password: str, *, ip: Optional[str]) -> None:
	await policy.enforce_pwreset_consume_rate(ip or "unknown")
	pool = await get_pool()
	async with pool.acquire() as conn:
		record = await conn.fetchrow("SELECT * FROM password_resets WHERE token = $1", token)
		if not record:
			audit.inc_pwreset_consume("invalid")
			raise policy.IdentityPolicyError("pwreset_token_invalid")
		if record.get("used_at") is not None:
			audit.inc_pwreset_consume("used")
			raise policy.IdentityPolicyError("pwreset_token_used")
		if record["expires_at"] <= _now():
			audit.inc_pwreset_consume("expired")
			raise policy.IdentityPolicyError("pwreset_token_expired")
		user_id = str(record["user_id"])
		policy.guard_password(new_password)
		hash_value = _PASSWORD_HASHER.hash(new_password)
		async with conn.transaction():
			await conn.execute(
				"""
				UPDATE users
				SET password_hash = $2, updated_at = NOW()
				WHERE id = $1
				""",
				user_id,
				hash_value,
			)
			await conn.execute(
				"""
				UPDATE password_resets
				SET used_at = NOW()
				WHERE id = $1
				""",
				record["id"],
			)
	await sessions.revoke_all_sessions(user_id)
	audit.inc_pwreset_consume("ok")
	await audit.log_event("pwreset_success", user_id=user_id, meta={"token": "redacted"})



