"""Service layer for identity onboarding, verification, and auth flows."""

from __future__ import annotations

import secrets
from datetime import datetime, timedelta, timezone
from typing import Optional
from uuid import UUID, uuid4

import asyncpg
from argon2 import PasswordHasher, exceptions as argon_exc

from app.domain.identity import models, policy, recovery, schemas, sessions, twofa
from app.infra.postgres import get_pool
from app.obs import metrics as obs_metrics

VERIFICATION_TTL_SECONDS = 24 * 3600
_PASSWORD_HASHER = PasswordHasher()


class IdentityServiceError(Exception):
	"""Raised for service-level issues with optional HTTP status mapping."""

	def __init__(self, reason: str, *, status_code: int = 400):
		super().__init__(reason)
		self.reason = reason
		self.status_code = status_code


class LoginFailed(IdentityServiceError):
	def __init__(self, reason: str = "invalid_credentials") -> None:
		super().__init__(reason, status_code=401)


class VerificationError(IdentityServiceError):
	def __init__(self, reason: str, *, gone: bool = False) -> None:
		super().__init__(reason, status_code=410 if gone else 400)


class CampusNotFound(IdentityServiceError):
	def __init__(self) -> None:
		super().__init__("campus_not_found", status_code=404)


class ProfileNotFound(IdentityServiceError):
	def __init__(self) -> None:
		super().__init__("profile_not_found", status_code=404)


def _now() -> datetime:
	return datetime.now(timezone.utc)


async def _fetch_campus(conn: asyncpg.Connection, campus_id: UUID) -> models.Campus:
	row = await conn.fetchrow("SELECT id, name, domain FROM campuses WHERE id = $1", str(campus_id))
	if not row:
		raise CampusNotFound()
	return models.Campus.from_record(row)


def _hash_password(password: str) -> str:
	policy.guard_password(password)
	return _PASSWORD_HASHER.hash(password)


def _generate_token() -> str:
	return secrets.token_urlsafe(48)


async def _upsert_verification(conn: asyncpg.Connection, user_id: UUID) -> str:
	token = _generate_token()
	expires_at = _now() + timedelta(seconds=VERIFICATION_TTL_SECONDS)
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


async def register(payload: schemas.RegisterRequest, *, ip_address: str) -> schemas.RegisterResponse:
	email = policy.normalise_email(payload.email)
	handle = policy.normalise_handle(payload.handle)
	display = handle

	await policy.enforce_register_rate(ip_address)
	policy.guard_handle_format(handle)
	password_hash = _hash_password(payload.password)

	await policy.reserve_handle(handle, str(uuid4()))
	try:
		pool = await get_pool()
		async with pool.acquire() as conn:
			campus = await _fetch_campus(conn, payload.campus_id)
			policy.guard_email_domain(email, campus)

			async with conn.transaction():
				existing_user = await conn.fetchrow("SELECT * FROM users WHERE email = $1", email)
				handle_owner = await conn.fetchrow("SELECT id FROM users WHERE handle = $1", handle)

				if handle_owner and (not existing_user or str(handle_owner["id"]) != str(existing_user["id"])):
					raise policy.HandleConflict("handle_taken")

				if existing_user and existing_user.get("email_verified"):
					raise policy.EmailConflict("email_taken")

				if existing_user:
					user_id = UUID(str(existing_user["id"]))
					await conn.execute(
						"""
						UPDATE users
						SET handle = $1,
							display_name = $2,
							campus_id = $3,
							email = $4,
							email_verified = FALSE,
							password_hash = $5,
							updated_at = NOW()
						WHERE id = $6
						""",
						handle,
						display,
						str(payload.campus_id),
						email,
						password_hash,
						str(user_id),
					)
				else:
					user_id = uuid4()
					await conn.execute(
						"""
						INSERT INTO users (
							id, email, email_verified, handle, display_name, bio, avatar_key,
							campus_id, privacy, status, password_hash, avatar_url
						)
						VALUES ($1, $2, FALSE, $3, $4, '', NULL, $5,
							jsonb_build_object('visibility','everyone','ghost_mode',FALSE),
							jsonb_build_object('text','', 'emoji','', 'updated_at', NOW()),
							$6, NULL)
						""",
						str(user_id),
						email,
						handle,
						display,
						str(payload.campus_id),
						password_hash,
					)

				await _upsert_verification(conn, user_id)
	finally:
		await policy.release_handle(handle)

	obs_metrics.inc_identity_register()
	# Email dispatch is out-of-band; token returned for tests/debug only
	return schemas.RegisterResponse(user_id=user_id, email=email)


async def verify_email(payload: schemas.VerifyRequest) -> schemas.VerificationStatus:
	token = payload.token.strip()
	if not token:
		raise VerificationError("token_missing")

	pool = await get_pool()
	async with pool.acquire() as conn:
		record = await conn.fetchrow("SELECT * FROM email_verifications WHERE token = $1", token)
		if not record:
			raise VerificationError("token_invalid", gone=True)
		verification = models.EmailVerification.from_record(record)
		if verification.used_at is not None:
			raise VerificationError("token_used", gone=True)
		if verification.expires_at <= _now():
			raise VerificationError("token_expired", gone=True)

		async with conn.transaction():
			await conn.execute("UPDATE email_verifications SET used_at = NOW() WHERE id = $1", str(verification.id))
			await conn.execute(
				"UPDATE users SET email_verified = TRUE, updated_at = NOW() WHERE id = $1",
				str(verification.user_id),
			)

	obs_metrics.inc_identity_verify()
	return schemas.VerificationStatus(verified=True, user_id=verification.user_id)


async def resend_verification(payload: schemas.ResendRequest) -> None:
	email = policy.normalise_email(payload.email)
	await policy.enforce_resend_rate(email)
	pool = await get_pool()
	async with pool.acquire() as conn:
		existing = await conn.fetchrow("SELECT id, email_verified FROM users WHERE email = $1", email)
		if not existing:
			return None
		if existing["email_verified"]:
			return None
		await _upsert_verification(conn, UUID(str(existing["id"])))

	obs_metrics.inc_identity_resend()
	return None


async def login(
	payload: schemas.LoginRequest,
	*,
	ip: Optional[str],
	user_agent: Optional[str],
	device_label: str = "",
) -> schemas.LoginResponse:
	email = policy.normalise_email(payload.email)
	await policy.enforce_login_rate(email)
	pool = await get_pool()
	async with pool.acquire() as conn:
		row = await conn.fetchrow("SELECT * FROM users WHERE email = $1", email)
		if not row:
			raise LoginFailed("not_found")
		user = models.User.from_record(row)
		if not user.password_hash:
			raise LoginFailed("password_missing")
		try:
			_PASSWORD_HASHER.verify(user.password_hash, payload.password)
		except argon_exc.VerifyMismatchError as exc:
			raise LoginFailed("invalid_credentials") from exc
		except argon_exc.VerificationError as exc:
			raise LoginFailed("invalid_credentials") from exc
		if not user.email_verified:
			raise LoginFailed("email_unverified")
		twofa_row = await conn.fetchrow("SELECT enabled FROM twofa WHERE user_id = $1", str(user.id))
		twofa_enabled = bool(twofa_row and twofa_row.get("enabled"))
	if twofa_enabled:
		challenge_id = await twofa.create_challenge(
			user,
			ip=ip,
			user_agent=user_agent,
			device_label=device_label,
		)
		return schemas.LoginResponse(user_id=user.id, twofa_required=True, challenge_id=challenge_id)
	response = await sessions.issue_session_tokens(
		user,
		ip=ip,
		user_agent=user_agent,
		device_label=device_label,
	)
	obs_metrics.inc_identity_login()
	return response


async def list_campuses() -> list[schemas.CampusOut]:
	pool = await get_pool()
	async with pool.acquire() as conn:
		rows = await conn.fetch("SELECT id, name, domain FROM campuses ORDER BY name ASC")
	return [schemas.CampusOut(id=row["id"], name=row["name"], domain=row.get("domain")) for row in rows]


async def request_password_reset(payload: schemas.PasswordResetRequest) -> None:
	await recovery.request_password_reset(payload.email)


async def consume_password_reset(payload: schemas.PasswordResetConsume, *, ip: Optional[str]) -> None:
	await recovery.consume_password_reset(payload.token, payload.new_password, ip=ip)


async def refresh(
	payload: schemas.RefreshRequest,
	*,
	ip: Optional[str],
	user_agent: Optional[str],
	fingerprint: str,
	refresh_cookie: str,
) -> schemas.LoginResponse:
	"""Rotate refresh token for an existing session and issue new access.

	The controller should pass the refresh cookie value explicitly. This function
	validates the session and delegates rotation to sessions.refresh_session.
	"""
	if not refresh_cookie:
		raise policy.IdentityPolicyError("refresh_invalid")
	pool = await get_pool()
	async with pool.acquire() as conn:
		row = await conn.fetchrow(
			"SELECT s.id, s.user_id, s.revoked, u.* FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.id = $1",
			str(payload.session_id),
		)
		if not row:
			raise policy.IdentityPolicyError("session_not_found")
		if row.get("revoked"):
			raise policy.IdentityPolicyError("session_revoked")
		user = models.User.from_record(row)
	return await sessions.refresh_session(
		user,
		session_id=payload.session_id,
		refresh_token=refresh_cookie,
		ip=ip,
		user_agent=user_agent,
	)


async def logout(payload: schemas.LogoutRequest) -> None:
	"""Revoke a session and clear its refresh token."""
	await sessions.revoke_session(str(payload.user_id), payload.session_id)
