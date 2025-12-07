"""Account deletion workflow helpers."""

from __future__ import annotations

import secrets
from datetime import datetime, timezone
from typing import Optional
from uuid import UUID

import asyncpg

from app.domain.identity import audit, mailer, policy, schemas, sessions
from app.infra.auth import AuthenticatedUser
from app.infra.postgres import get_pool
from app.infra.redis import redis_client
from app.obs import metrics as obs_metrics

DEFAULT_PRIVACY = schemas.PrivacySettings().model_dump()


def _now() -> datetime:
	return datetime.now(timezone.utc)


def _token_key(user_id: str) -> str:
	return f"delete:confirm:{user_id}"


async def _load_user(conn: asyncpg.Connection, user_id: str) -> asyncpg.Record:
	row = await conn.fetchrow(
		"""
		SELECT id, email, handle
		FROM users
		WHERE id = $1
		""",
		user_id,
	)
	if not row:
		raise policy.IdentityPolicyError("user_missing")
	return row


async def request_deletion(auth_user: AuthenticatedUser) -> schemas.DeletionStatus:
	await policy.enforce_deletion_request_rate(auth_user.id)
	token = secrets.token_urlsafe(24)
	issued_at = _now()
	await redis_client.set(_token_key(auth_user.id), token, ex=policy.DELETION_TOKEN_TTL_SECONDS)
	pool = await get_pool()
	async with pool.acquire() as conn:
		async with conn.transaction():
			await _ensure_table(conn)
			user_row = await _load_user(conn, auth_user.id)
			await conn.execute(
				"""
				INSERT INTO account_deletions (user_id, requested_at, confirmed_at, purged_at)
				VALUES ($1, $2, NULL, NULL)
				ON CONFLICT (user_id)
				DO UPDATE SET requested_at = EXCLUDED.requested_at
				""",
				auth_user.id,
				issued_at,
			)
	if user_row.get("email"):
		await mailer.send_deletion_confirmation(user_row["email"], token, user_id=auth_user.id)
	obs_metrics.inc_identity_delete_request()
	await audit.append_db_event(auth_user.id, "delete_requested", {"token_hash": "issued"})
	await audit.log_event("delete_requested", user_id=auth_user.id, meta={"token": "issued"})
	return await get_status(auth_user.id)


async def _generate_deleted_handle(conn: asyncpg.Connection) -> str:
	for _ in range(10):
		handle = f"deleted-{secrets.token_hex(4)}"
		exists = await conn.fetchval("SELECT 1 FROM users WHERE handle = $1", handle)
		if not exists:
			return handle
	return f"deleted-{secrets.token_hex(6)}"


async def confirm_deletion(auth_user: AuthenticatedUser, token: str) -> schemas.DeletionStatus:
	stored = await redis_client.get(_token_key(auth_user.id))
	if not stored or stored != token:
		raise policy.IdentityPolicyError("delete_token_invalid")
	# Check for legal hold before deletion
	await _check_legal_hold(auth_user.id)
	return await _apply_deletion(auth_user, mark_requested=True)


async def force_delete(auth_user: AuthenticatedUser) -> schemas.DeletionStatus:
	"""Immediate deletion without email token (useful for internal/dev)."""
	# Check for legal hold before deletion
	await _check_legal_hold(auth_user.id)
	return await _apply_deletion(auth_user, mark_requested=True, force=True)


async def _check_legal_hold(user_id: str) -> None:
	"""Check if user is under legal hold and raise error if so."""
	try:
		from app.domain.legal import holds
		is_held = await holds.is_user_under_hold(UUID(user_id))
		if is_held:
			raise policy.IdentityPolicyError("user_under_legal_hold")
	except ImportError:
		# Legal module not available, skip check
		pass



async def _ensure_table(conn: asyncpg.Connection) -> None:
	"""Ensure account_deletions table exists."""
	await conn.execute("""
		CREATE TABLE IF NOT EXISTS account_deletions (
			user_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
			requested_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
			confirmed_at TIMESTAMPTZ,
			purged_at TIMESTAMPTZ
		)
	""")


async def _apply_deletion(auth_user: AuthenticatedUser, mark_requested: bool, force: bool = False) -> schemas.DeletionStatus:
	pool = await get_pool()
	async with pool.acquire() as conn:
		async with conn.transaction():
			await _ensure_table(conn)
			await _load_user(conn, auth_user.id)
			new_handle = await _generate_deleted_handle(conn)
			await conn.execute(
				"""
				UPDATE users
				SET email = NULL,
					email_verified = FALSE,
					handle = $1,
					display_name = 'Deleted User',
					bio = '',
					privacy = $2,
					status = jsonb_build_object('text', '', 'emoji', '', 'updated_at', NOW()),
					avatar_key = NULL,
					avatar_url = NULL,
					password_hash = 'argon2id$deleted',
					updated_at = NOW()
				WHERE id = $3
				""",
				new_handle,
				DEFAULT_PRIVACY,
				auth_user.id,
			)
			await conn.execute(
				"""
				INSERT INTO account_deletions (user_id, requested_at, confirmed_at)
				VALUES ($1, NOW(), NOW())
				ON CONFLICT (user_id)
				DO UPDATE SET confirmed_at = NOW()
				""",
				auth_user.id,
			)
	if not force:
		await redis_client.delete(_token_key(auth_user.id))
	await sessions.revoke_all_sessions(auth_user.id)
	obs_metrics.inc_identity_delete_confirm()
	await audit.append_db_event(auth_user.id, "delete_confirmed", {"force": force})
	await audit.log_event("delete_confirmed", user_id=auth_user.id, meta={"force": force})
	return await get_status(auth_user.id)


async def get_status(user_id: str) -> schemas.DeletionStatus:
	p_pool = await get_pool()
	async with p_pool.acquire() as conn:
		await _ensure_table(conn)
		row = await conn.fetchrow(
			"""
			SELECT requested_at, confirmed_at, purged_at
			FROM account_deletions
			WHERE user_id = $1
			""",
			user_id,
		)
	if not row:
		raise policy.IdentityPolicyError("delete_not_requested")
	return schemas.DeletionStatus(
		requested_at=row["requested_at"],
		confirmed_at=row.get("confirmed_at"),
		purged_at=row.get("purged_at"),
	)


async def mark_purged(user_id: str) -> None:
	p_pool = await get_pool()
	async with p_pool.acquire() as conn:
		await conn.execute(
			"""
			UPDATE account_deletions
			SET purged_at = NOW()
			WHERE user_id = $1
			""",
			user_id,
		)
	await audit.append_db_event(user_id, "delete_purged", {})
	await audit.log_event("delete_purged", user_id=user_id, meta={})
