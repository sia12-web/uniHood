"""Phone number add/verify flows backed by SMS OTPs."""

from __future__ import annotations

import json
from datetime import datetime, timezone
from typing import Tuple

import asyncpg

from app.domain.identity import audit, models, policy, sms
from app.infra.postgres import get_pool
from app.infra.redis import redis_client
from app.obs import metrics as obs_metrics

OTP_KEY_TEMPLATE = "otp:sms:{user_id}"
OTP_FAIL_KEY_TEMPLATE = "otp:sms:fail:{user_id}"


def _now() -> datetime:
	return datetime.now(timezone.utc)


def _otp_key(user_id: str) -> str:
	return OTP_KEY_TEMPLATE.format(user_id=user_id)


def _fail_key(user_id: str) -> str:
	return OTP_FAIL_KEY_TEMPLATE.format(user_id=user_id)


async def _load_user_phone(conn: asyncpg.Connection, user_id: str) -> models.UserPhone | None:
	row = await conn.fetchrow("SELECT * FROM user_phones WHERE user_id = $1", user_id)
	return models.UserPhone.from_record(row) if row else None


async def request_code(user: models.User, e164: str) -> None:
	"""Normalize number, store pending OTP, and dispatch SMS."""
	await policy.enforce_phone_sms_rate(str(user.id))
	normalized = policy.normalise_phone(e164)
	policy.guard_phone_number(normalized)
	pool = await get_pool()
	async with pool.acquire() as conn:
		async with conn.transaction():
			existing = await conn.fetchrow(
				"SELECT user_id FROM user_phones WHERE e164 = $1",
				normalized,
			)
			if existing and str(existing["user_id"]) != str(user.id):
				raise policy.IdentityPolicyError("phone_taken")
			await conn.execute(
				"""
				INSERT INTO user_phones (user_id, e164, verified, verified_at)
				VALUES ($1, $2, FALSE, NULL)
				ON CONFLICT (user_id)
				DO UPDATE SET e164 = EXCLUDED.e164, verified = FALSE, verified_at = NULL
				""",
				str(user.id),
				normalized,
			)
	code = sms.generate_otp()
	payload = json.dumps({"code": code, "e164": normalized})
	await redis_client.set(_otp_key(str(user.id)), payload, ex=policy.SMS_OTP_TTL_SECONDS)
	await redis_client.delete(_fail_key(str(user.id)))
	await sms.send_sms_code(normalized, code)
	obs_metrics.inc_phone_verify("request", "ok")
	await audit.log_event(
		"phone_verify_requested",
		user_id=str(user.id),
		meta={"phone_suffix": normalized[-4:]},
	)


async def _fetch_pending(user_id: str) -> Tuple[str, str] | None:
	data = await redis_client.get(_otp_key(user_id))
	if not data:
		return None
	if isinstance(data, bytes):
		data = data.decode("utf-8")
	try:
		parsed = json.loads(data)
		return parsed.get("code", ""), parsed.get("e164", "")
	except json.JSONDecodeError:
		return None


async def _increment_failures(user_id: str) -> int:
	key = _fail_key(user_id)
	value = await redis_client.incr(key)
	if value == 1:
		await redis_client.expire(key, policy.SMS_OTP_TTL_SECONDS)
	return int(value)


async def verify_code(user_id: str, code: str) -> models.UserPhone:
	clean_code = code.strip()
	if len(clean_code) < 4:
		raise policy.IdentityPolicyError("otp_invalid")
	pending = await _fetch_pending(user_id)
	if not pending:
		raise policy.IdentityPolicyError("otp_expired")
	stored_code, stored_number = pending
	if stored_code != clean_code:
		attempts = await _increment_failures(user_id)
		obs_metrics.inc_phone_verify("verify", "mismatch")
		if attempts >= policy.SMS_OTP_MAX_FAILURES:
			await redis_client.delete(_otp_key(user_id))
			raise policy.IdentityPolicyError("otp_locked")
		raise policy.IdentityPolicyError("otp_incorrect")
	pool = await get_pool()
	async with pool.acquire() as conn:
		await conn.execute(
			"""
			UPDATE user_phones
			SET verified = TRUE, verified_at = NOW()
			WHERE user_id = $1
			""",
			user_id,
		)
	row = await conn.fetchrow("SELECT * FROM user_phones WHERE user_id = $1", user_id)
	await redis_client.delete(_otp_key(user_id))
	await redis_client.delete(_fail_key(user_id))
	phone = models.UserPhone.from_record(row)
	obs_metrics.inc_phone_verify("verify", "ok")
	await audit.log_event(
		"phone_verified",
		user_id=user_id,
		meta={"phone_suffix": phone.e164[-4:]},
	)
	return phone


async def remove_phone(user_id: str) -> None:
	pool = await get_pool()
	async with pool.acquire() as conn:
		await conn.execute("DELETE FROM user_phones WHERE user_id = $1", user_id)
	await redis_client.delete(_otp_key(user_id))
	await redis_client.delete(_fail_key(user_id))
	obs_metrics.inc_phone_verify("remove", "ok")
	await audit.log_event("phone_removed", user_id=user_id, meta={})
