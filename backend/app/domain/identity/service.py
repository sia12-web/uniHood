"""Service layer for identity onboarding, verification, and auth flows."""

from __future__ import annotations

import secrets
from datetime import datetime, timedelta, timezone
from typing import Optional
from uuid import UUID, uuid4

import asyncpg
from argon2 import exceptions as argon_exc

from app.domain.identity import models, policy, recovery, schemas, sessions, twofa, mailer, rbac
from app.infra.password import PASSWORD_HASHER, check_needs_rehash
from app.infra.postgres import get_pool
import re
import string
from app.infra.postgres import get_pool
from app.settings import settings
from app.obs import metrics as obs_metrics

HANDLE_ALLOWED_RE = re.compile(r"[^a-z0-9-]")

VERIFICATION_TTL_SECONDS = 24 * 3600
_PASSWORD_HASHER = PASSWORD_HASHER

MAIN_CAMPUS_ID = UUID("33333333-3333-3333-3333-333333333333")
MCGILL_CAMPUS_ID = UUID("c4f7d1ec-7b01-4f7b-a1cb-4ef0a1d57ae2")
EXTRA_DEMO_CAMPUS_ID = UUID("aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa")


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
	row = await conn.fetchrow("SELECT id, name, domain, logo_url FROM campuses WHERE id = $1", str(campus_id))
	if not row:
		raise CampusNotFound()
	return models.Campus.from_record(row)


def _is_known_demo_or_default_campus(campus_id: UUID) -> bool:
	return campus_id in {MAIN_CAMPUS_ID, MCGILL_CAMPUS_ID, EXTRA_DEMO_CAMPUS_ID}


async def _pick_existing_campus(conn: asyncpg.Connection, *, preferred: list[UUID]) -> models.Campus:
	"""Pick an existing campus, preferring known IDs when present.

	This is used to keep registration working if a demo/default campus id was deleted.
	"""
	for campus_id in preferred:
		row = await conn.fetchrow(
			"SELECT id, name, domain, logo_url FROM campuses WHERE id = $1",
			str(campus_id),
		)
		if row:
			return models.Campus.from_record(row)

	row = await conn.fetchrow(
		"SELECT id, name, domain, logo_url FROM campuses ORDER BY created_at ASC LIMIT 1"
	)
	if not row:
		raise IdentityServiceError("campus_not_configured", status_code=500)
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


def _generate_handle_candidate(display_name: str) -> str:
	"""Generate a handle candidate from display name + random suffix."""
	# 1. Lowercase
	base = display_name.lower().strip()
	# 2. Replace spaces with hyphens
	base = base.replace(" ", "-")
	# 3. Remove special characters (keep a-z, 0-9, hyphen)
	base = HANDLE_ALLOWED_RE.sub("", base)
	# 4. Truncate to reasonable length (e.g. 20 chars max for base) to allow suffix
	if not base:
		base = "user"
	base = base[:20]
	
	# 5. Append random 4-6 char suffix
	suffix_len = secrets.choice([4, 5, 6])
	suffix = "".join(secrets.choice(string.ascii_lowercase + string.digits) for _ in range(suffix_len))
	
	return f"{base}-{suffix}"



async def register(payload: schemas.RegisterRequest, *, ip_address: str) -> schemas.RegisterResponse:
	email = policy.normalise_email(payload.email)
	display = payload.display_name
	campus_id_from_payload = payload.campus_id is not None
	campus_id = payload.campus_id
	if campus_id is None:
		default_campus_raw = (getattr(settings, "default_campus_id", "") or "").strip()
		if default_campus_raw:
			try:
				campus_id = UUID(default_campus_raw)
			except ValueError as exc:
				raise IdentityServiceError("campus_not_configured", status_code=500) from exc

	await policy.enforce_register_rate(ip_address)
	
	# Auto-generate handle with retries
	handle = ""
	reserved = False
	
	# Try up to 5 times to generate a unique handle
	for attempt in range(5):
		candidate = _generate_handle_candidate(display)
		policy.guard_handle_format(candidate)
		try:
			# Optimistically reserve in Redis (short TTL) to prevent parallel races
			await policy.reserve_handle(candidate, str(uuid4()))
			
			# Check DB existence (users table)
			pool = await get_pool()
			async with pool.acquire() as conn:
				exists = await conn.fetchval(
					"SELECT 1 FROM users WHERE handle = $1 AND deleted_at IS NULL", 
					candidate
				)
				if not exists:
					handle = candidate
					reserved = True
					break
			
			# If exists in DB, release redis reservation and retry
			await policy.release_handle(candidate)
		except policy.HandleConflict:
			# Redis reservation failed, retry
			continue

	if not handle:
		# Fallback if we fail to generate unique (unlikely)
		handle = f"user-{uuid4().hex[:8]}"
		await policy.reserve_handle(handle, str(uuid4()))
		reserved = True

	password_hash = _hash_password(payload.password)
	token = ""

	try:
		pool = await get_pool()
		async with pool.acquire() as conn:
			campus: Optional[models.Campus] = None
			if campus_id:
				try:
					campus = await _fetch_campus(conn, campus_id)
				except CampusNotFound:
					# Keep prod signup robust: if a demo/default campus id was deleted,
					# fall back to any existing campus instead of hard-failing.
					if (not campus_id_from_payload) or _is_known_demo_or_default_campus(campus_id):
						preferred = [MAIN_CAMPUS_ID]
						default_raw = (getattr(settings, "default_campus_id", "") or "").strip()
						try:
							if default_raw:
								preferred.insert(0, UUID(default_raw))
						except ValueError:
							pass
						preferred.append(MCGILL_CAMPUS_ID)
						preferred.append(EXTRA_DEMO_CAMPUS_ID)
						campus = await _pick_existing_campus(conn, preferred=preferred)
						campus_id = campus.id
					else:
						raise

			if campus:
				policy.guard_email_domain(email, campus)

			async with conn.transaction():
				existing_user = await conn.fetchrow("SELECT * FROM users WHERE email = $1 AND deleted_at IS NULL", email)
				handle_owner = await conn.fetchrow("SELECT id FROM users WHERE handle = $1 AND deleted_at IS NULL", handle)

				if handle_owner and (not existing_user or str(handle_owner["id"]) != str(existing_user["id"])):
					raise policy.HandleConflict("handle_taken")

				if existing_user and existing_user.get("email_verified"):
					raise policy.EmailConflict("email_taken")

				campus_id_val = str(campus_id) if campus_id else None

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
						campus_id_val,
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
						campus_id_val,
						password_hash,
					)

				# if settings.is_dev():
				# 	await conn.execute("UPDATE users SET email_verified = TRUE WHERE id = $1", str(user_id))

				token = await _upsert_verification(conn, user_id)
	finally:
		if reserved:
			await policy.release_handle(handle)

	obs_metrics.inc_identity_register()
	
	# Send verification email
	# if not settings.is_dev():
	await mailer.send_email_verification(email, token, user_id=str(user_id))
		
	return schemas.RegisterResponse(user_id=user_id, email=email)


async def verify_email(
	payload: schemas.VerifyRequest,
	*,
	ip: Optional[str] = None,
	user_agent: Optional[str] = None,
	device_label: str = "",
	fingerprint: Optional[str] = None,
) -> schemas.VerificationStatus:
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
			row = await conn.fetchrow("SELECT * FROM users WHERE id = $1", str(verification.user_id))
			user = models.User.from_record(row)
			user_roles = await rbac.list_user_roles(str(user.id))
			user.roles = [r.role_name for r in user_roles]

	obs_metrics.inc_identity_verify()
	tokens = await sessions.issue_session_tokens(
		user,
		ip=ip,
		user_agent=user_agent,
		device_label=device_label,
		fingerprint=fingerprint,
	)
	return schemas.VerificationStatus(
		verified=True,
		user_id=verification.user_id,
		access_token=tokens.access_token,
		refresh_token=tokens.refresh_token,
		expires_in=tokens.expires_in,
		session_id=tokens.session_id,
	)


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
		token = await _upsert_verification(conn, UUID(str(existing["id"])))
		
	await mailer.send_email_verification(email, token, user_id=str(existing["id"]))
	obs_metrics.inc_identity_resend()
	return None


async def login(
	payload: schemas.LoginRequest,
	*,
	ip: Optional[str],
	user_agent: Optional[str],
	device_label: str = "",
	fingerprint: Optional[str] = None,
) -> schemas.LoginResponse:
	email = policy.normalise_email(payload.email)
	await policy.enforce_login_rate(email)
	pool = await get_pool()
	async with pool.acquire() as conn:
		row = await conn.fetchrow("SELECT * FROM users WHERE email = $1", email)
		if not row:
			# Return generic error to prevent user enumeration
			raise LoginFailed("invalid_credentials")
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

		user_roles = await rbac.list_user_roles(str(user.id))
		user.roles = [r.role_name for r in user_roles]

		twofa_row = await conn.fetchrow("SELECT enabled FROM twofa WHERE user_id = $1", str(user.id))
		twofa_enabled = bool(twofa_row and twofa_row.get("enabled"))
	if twofa_enabled:
		challenge_id = await twofa.create_challenge(
			user,
			ip=ip,
			user_agent=user_agent,
			device_label=device_label,
			fingerprint=fingerprint,
		)
		return schemas.LoginResponse(user_id=user.id, twofa_required=True, challenge_id=challenge_id)
	response = await sessions.issue_session_tokens(
		user,
		ip=ip,
		user_agent=user_agent,
		device_label=device_label,
		fingerprint=fingerprint,
	)
	obs_metrics.inc_identity_login()
	return response


async def list_campuses() -> list[schemas.CampusOut]:
	pool = await get_pool()
	async with pool.acquire() as conn:
		rows = await conn.fetch("SELECT id, name, domain, logo_url FROM campuses ORDER BY name ASC")
	return [schemas.CampusOut(id=row["id"], name=row["name"], domain=row.get("domain"), logo_url=row.get("logo_url")) for row in rows]


async def get_campus_by_id(campus_id: UUID) -> schemas.CampusOut:
	"""Fetch a single campus by ID."""
	pool = await get_pool()
	async with pool.acquire() as conn:
		campus = await _fetch_campus(conn, campus_id)
	return schemas.CampusOut(id=campus.id, name=campus.name, domain=campus.domain, logo_url=campus.logo_url)


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
		user_roles = await rbac.list_user_roles(str(user.id))
		user.roles = [r.role_name for r in user_roles]
		result = await sessions.refresh_session(
		user,
		session_id=payload.session_id,
		refresh_token=refresh_cookie,
		ip=ip,
		user_agent=user_agent,
		fingerprint=fingerprint,
	)
		# Ensure expires_in reflects current access TTL setting if available
		try:
			result.expires_in = settings.access_ttl_minutes * 60
		except Exception:
			pass
		return result


async def logout(payload: schemas.LogoutRequest) -> None:
	"""Revoke a session and clear its refresh token."""
	await sessions.revoke_session(str(payload.user_id), payload.session_id)
