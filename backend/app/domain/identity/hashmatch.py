"""Contact discovery hashing and matching helpers."""

from __future__ import annotations

import hashlib
import json
import secrets
from datetime import datetime, timedelta, timezone
from typing import Iterable, Mapping

import asyncpg

from app.domain.identity import audit, flags, models, policy, schemas
from app.infra.postgres import get_pool
from app.infra.redis import redis_client
from app.obs import metrics as obs_metrics

SALT_KEY = "contact:salt"


def _now() -> datetime:
	return datetime.now(timezone.utc)


def _default_rotate_at() -> datetime:
	return _now() + timedelta(seconds=policy.CONTACT_SALT_ROTATE_SECONDS)


def _serialize_salt(salt: str, rotates_at: datetime) -> str:
	return json.dumps({"salt": salt, "rotates_at": rotates_at.isoformat()})


def _deserialize_salt(raw: str) -> tuple[str, datetime]:
	data = json.loads(raw)
	rotates_at = datetime.fromisoformat(data["rotates_at"])
	return data["salt"], rotates_at


async def _persist_optin(conn: asyncpg.Connection, user_id: str, enabled: bool) -> schemas.ContactOptInResponse:
	row = await conn.fetchrow(
		"""
		INSERT INTO contact_optin (user_id, enabled)
		VALUES ($1, $2)
		ON CONFLICT (user_id)
		DO UPDATE SET enabled = EXCLUDED.enabled, updated_at = NOW()
		RETURNING user_id, enabled, updated_at
		""",
		user_id,
		enabled,
	)
	return schemas.ContactOptInResponse(enabled=row["enabled"], updated_at=row["updated_at"])


async def get_or_rotate_salt() -> schemas.ContactSaltResponse:
	stored = await redis_client.get(SALT_KEY)
	if stored:
		if isinstance(stored, bytes):
			stored = stored.decode("utf-8")
		try:
			salt, rotates_at = _deserialize_salt(stored)
			now = _now()
			if rotates_at > now:
				return schemas.ContactSaltResponse(salt=salt, rotates_at=rotates_at)
		except Exception:
			pass
	salt = secrets.token_urlsafe(16)
	rotates_at = _default_rotate_at()
	await redis_client.set(SALT_KEY, _serialize_salt(salt, rotates_at))
	return schemas.ContactSaltResponse(salt=salt, rotates_at=rotates_at)


async def set_opt_in(user: models.User, enabled: bool) -> schemas.ContactOptInResponse:
	pools = await get_pool()
	async with pools.acquire() as conn:
		response = await _persist_optin(conn, str(user.id), enabled)
	if enabled:
		await audit.log_event("contact_optin_enabled", user_id=str(user.id), meta={})
	else:
		await audit.log_event("contact_optin_disabled", user_id=str(user.id), meta={})
	obs_metrics.inc_contact_discovery("optin")
	return response


def _parse_hash(value: str) -> tuple[str, str]:
	if ":" in value:
		prefix, digest = value.split(":", 1)
		kind = prefix.strip().lower()
		digest = digest.strip()
	else:
		kind = "email"
		digest = value.strip()
	if kind not in {"email", "phone"}:
		raise policy.IdentityPolicyError("contact_hash_kind")
	if not (32 <= len(digest) <= 128):
		raise policy.IdentityPolicyError("contact_hash_length")
	return kind, digest


async def upload_hashes(user: models.User, hashes: Iterable[str]) -> int:
	items = list(hashes)
	if len(items) > policy.CONTACT_HASH_LIMIT:
		raise policy.IdentityPolicyError("contact_hash_limit")
	payload_size = sum(len(item) for item in items)
	if payload_size > policy.CONTACT_HASH_SIZE_LIMIT:
		raise policy.IdentityPolicyError("contact_hash_payload")
	await get_or_rotate_salt()  # ensure salt exists
	values = [_parse_hash(item) for item in items]
	pool = await get_pool()
	async with pool.acquire() as conn:
		if not await _fetch_optin(conn, str(user.id)):
			raise policy.IdentityPolicyError("contact_optout")
		async with conn.transaction():
			for kind, digest in values:
				await conn.execute(
					"""
					INSERT INTO contact_hashes (hash, ref_kind)
					VALUES ($1, $2)
					ON CONFLICT (hash) DO NOTHING
					""",
					digest,
					kind,
				)
	obs_metrics.inc_contact_discovery("upload")
	await audit.log_event(
		"contact_hashes_uploaded",
		user_id=str(user.id),
		meta={"count": str(len(items))},
	)
	return len(items)


def _hash_value(value: str, salt: str) -> str:
	return hashlib.sha256(f"{value}|{salt}".encode("utf-8")).hexdigest()


async def _fetch_optin(conn: asyncpg.Connection, user_id: str) -> bool:
	row = await conn.fetchrow("SELECT enabled FROM contact_optin WHERE user_id = $1", user_id)
	return bool(row and row.get("enabled"))


async def match_hashes(user: models.User, hashes: Iterable[str]) -> list[str]:
	items = list(hashes)
	if not items:
		return []
	salt_response = await get_or_rotate_salt()
	salt = salt_response.salt
	parsed = [_parse_hash(item) for item in items]
	lookup = {(kind, digest) for kind, digest in parsed}
	pool = await get_pool()
	async with pool.acquire() as conn:
		if not await _fetch_optin(conn, str(user.id)):
			raise policy.IdentityPolicyError("contact_optout")
		row_user = await conn.fetchrow(
			"SELECT id, handle, campus_id, email, email_verified FROM users WHERE id = $1",
			str(user.id),
		)
		if not row_user:
			raise policy.IdentityPolicyError("user_not_found")
		campus_id = row_user.get("campus_id")
		campus_scope = campus_id
		cross_flag = await flags.evaluate_flag(
			"identity.contact.cross_campus",
			user_id=str(user.id),
			campus_id=str(campus_id) if campus_id else None,
		)
		if cross_flag.enabled:
			campus_scope = None
		query = """
		SELECT u.id, u.handle, u.email, u.email_verified, p.e164, p.verified
		FROM users u
		LEFT JOIN user_phones p ON p.user_id = u.id
		JOIN contact_optin o ON o.user_id = u.id AND o.enabled = TRUE
		WHERE u.id <> $1
		  AND ($2::uuid IS NULL OR u.campus_id = $2)
		"""
		rows = await conn.fetch(query, str(user.id), campus_scope)
	results: set[str] = set()
	for row in rows:
		handle = str(row.get("handle"))
		email = row.get("email")
		email_verified = bool(row.get("email_verified"))
		phone = row.get("e164")
		phone_verified = bool(row.get("verified"))
		if email and email_verified:
			hash_value = _hash_value(policy.normalise_email(email), salt)
			if ("email", hash_value) in lookup:
				results.add(handle)
		if phone and phone_verified:
			hash_value = _hash_value(policy.normalise_phone(phone), salt)
			if ("phone", hash_value) in lookup:
				results.add(handle)
	obs_metrics.inc_contact_discovery("match")
	await audit.log_event(
		"contact_hashes_matched",
		user_id=str(user.id),
		meta={"matches": str(len(results))},
	)
	return sorted(results)
