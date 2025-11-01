"""Staged email change flow with verify-before-swap semantics."""

from __future__ import annotations

import secrets
from datetime import datetime, timedelta, timezone
from typing import Optional
from uuid import UUID, uuid4

import asyncpg

from app.domain.identity import audit, mailer, models, policy
from app.infra.postgres import get_pool
from app.obs import metrics as obs_metrics


def _utcnow() -> datetime:
	return datetime.now(timezone.utc)


async def _load_campus(conn: asyncpg.Connection, campus_id: Optional[UUID]) -> Optional[models.Campus]:
	if not campus_id:
		return None
	row = await conn.fetchrow("SELECT id, name, domain FROM campuses WHERE id = $1", str(campus_id))
	return models.Campus.from_record(row) if row else None


async def _generate_token() -> str:
	return secrets.token_urlsafe(32)


async def _insert_request(
	conn: asyncpg.Connection,
	*,
	user: models.User,
	new_email: str,
	expires_at: datetime,
	token: str,
) -> models.EmailChangeRequest:
	row = await conn.fetchrow(
		"""
		INSERT INTO email_change_requests (id, user_id, new_email, token, expires_at)
		VALUES ($1, $2, $3, $4, $5)
		RETURNING id, user_id, new_email, token, expires_at, used_at, created_at
		""",
		uuid4(),
		str(user.id),
		new_email,
		token,
		expires_at,
	)
	return models.EmailChangeRequest.from_record(row)


async def request_change(user: models.User, new_email: str) -> str:
	"""Create a staged email change request and dispatch a confirmation email."""
	await policy.enforce_email_change_request_rate(str(user.id))
	clean_email = policy.normalise_email(new_email)
	if not clean_email:
		raise policy.IdentityPolicyError("email_invalid")
	if clean_email == policy.normalise_email(user.email or ""):
		raise policy.IdentityPolicyError("email_same")
	pool = await get_pool()
	async with pool.acquire() as conn:
		async with conn.transaction():
			campus = await _load_campus(conn, user.campus_id)
			policy.guard_email_domain(clean_email, campus)
			existing = await conn.fetchrow(
				"SELECT id, email_verified FROM users WHERE email = $1",
				clean_email,
			)
			if existing and bool(existing.get("email_verified")) and str(existing["id"]) != str(user.id):
				raise policy.EmailConflict("email_taken")
			await conn.execute("DELETE FROM email_change_requests WHERE user_id = $1", str(user.id))
			token = await _generate_token()
			expires_at = _utcnow() + timedelta(seconds=policy.EMAIL_CHANGE_TTL_SECONDS)
			req = await _insert_request(conn, user=user, new_email=clean_email, expires_at=expires_at, token=token)
	await mailer.send_email_change_confirmation(clean_email, token, user_id=str(user.id))
	obs_metrics.inc_email_change("request")
	await audit.log_event(
		"email_change_requested",
		user_id=str(user.id),
		meta={"new_email_hash": mailer.mask_email(clean_email)},
	)
	return req.token


async def _issue_verification(conn: asyncpg.Connection, user_id: UUID) -> str:
	token = secrets.token_urlsafe(48)
	expires_at = _utcnow() + timedelta(seconds=policy.EMAIL_VERIFICATION_TTL_SECONDS)
	await conn.execute("DELETE FROM email_verifications WHERE user_id = $1", str(user_id))
	await conn.execute(
		"""
		INSERT INTO email_verifications (id, user_id, token, expires_at)
		VALUES ($1, $2, $3, $4)
		""",
		uuid4(),
		str(user_id),
		token,
		expires_at,
	)
	return token


async def confirm_change(token: str) -> str:
	"""Consume an email change token and trigger re-verification."""
	clean = token.strip()
	if not clean:
		raise policy.IdentityPolicyError("email_change_token_invalid")
	pool = await get_pool()
	async with pool.acquire() as conn:
		row = await conn.fetchrow(
			"SELECT * FROM email_change_requests WHERE token = $1",
			clean,
		)
		if not row:
			raise policy.IdentityPolicyError("email_change_token_invalid")
		req = models.EmailChangeRequest.from_record(row)
		if req.is_used:
			raise policy.IdentityPolicyError("email_change_token_used")
		if req.is_expired:
			raise policy.IdentityPolicyError("email_change_token_expired")
		# re-validate uniqueness
		existing = await conn.fetchrow(
			"SELECT id, email_verified FROM users WHERE email = $1",
			req.new_email,
		)
		if existing and bool(existing.get("email_verified")) and str(existing["id"]) != str(req.user_id):
			raise policy.EmailConflict("email_taken")
		verification_token: str
		async with conn.transaction():
			await conn.execute(
				"UPDATE email_change_requests SET used_at = NOW() WHERE id = $1",
				str(req.id),
			)
			await conn.execute(
				"""
				UPDATE users
				SET email = $2,
					email_verified = FALSE,
					updated_at = NOW()
				WHERE id = $1
				""",
				str(req.user_id),
				req.new_email,
			)
			verification_token = await _issue_verification(conn, req.user_id)
	await mailer.send_email_verification(req.new_email, verification_token, user_id=str(req.user_id))
	obs_metrics.inc_email_change("confirm")
	await audit.log_event(
		"email_change_confirmed",
		user_id=str(req.user_id),
		meta={"new_email_hash": mailer.mask_email(req.new_email)},
	)
	return verification_token
