"""Policy guards, rate limits, and validation helpers for identity flows."""

from __future__ import annotations

import re
import time
from typing import Mapping, Optional
from urllib.parse import urlparse

import asyncpg

from app.domain.identity.models import Campus
from app.infra.redis import redis_client
from app.settings import settings

HANDLE_REGEX = re.compile(r"^[a-z0-9_-]{3,30}$")
PASSWORD_MIN_LEN = 8
BIO_MAX_LEN = 500
DISPLAY_MAX_LEN = 80
STATUS_TEXT_MAX = 120
BLOCKED_HANDLES = {"admin", "support", "unihood", "system"}
MAJOR_MAX_LEN = 80
GRAD_YEAR_MIN = 1900
GRAD_YEAR_MAX = 2100
PASSIONS_MAX = 8
PASSION_MIN_LEN = 2
PASSION_MAX_LEN = 40

REGISTER_PER_HOUR = 20
VERIFY_PER_MINUTE = 6
LOGIN_PER_MINUTE = 12
RESEND_PER_HOUR = 3
PWRESET_PER_HOUR = 5
PWRESET_CONSUME_PER_MINUTE = 20
TWOFA_VERIFY_PER_MINUTE = 12
PRIVACY_UPDATE_PER_MINUTE = 6
EXPORT_REQUEST_PER_HOUR = 2
DELETION_REQUEST_PER_DAY = 2
AUDIT_PAGE_MAX = 100
VERIFY_SSO_PER_HOUR = 10
VERIFY_DOC_PER_HOUR = 6
INTEREST_UPDATE_PER_MINUTE = 20
SKILL_UPDATE_PER_MINUTE = 20
LINK_UPDATE_PER_MINUTE = 10
PROFILE_REBUILD_PER_HOUR = 6
PASSKEY_REGISTER_PER_HOUR = 10
PASSKEY_AUTH_PER_MINUTE = 30
ACCOUNT_LINK_PER_HOUR = 20
EMAIL_CHANGE_PER_HOUR = 5
PHONE_SMS_PER_HOUR = 6
CONTACT_HASH_LIMIT = 5000
CONTACT_HASH_SIZE_LIMIT = 500 * 1024
SMS_OTP_MAX_FAILURES = 6

DOC_UPLOAD_TTL_SECONDS = 24 * 3600
REVIEW_LOCK_TTL_SECONDS = 5 * 60

ACCESS_TTL_MINUTES = 15
REFRESH_TTL_DAYS = 7
PWRESET_TTL_MINUTES = 30
RECOVERY_CODES_COUNT = 10
RECOVERY_CODE_LEN = 10
TOTP_PERIOD_S = 30
EXPORT_JOB_TTL_SECONDS = 24 * 3600
DELETION_TOKEN_TTL_SECONDS = 24 * 3600
PASSKEY_CHALLENGE_TTL_SECONDS = 300
MAX_PASSKEYS_PER_USER = 10
DEVICE_LABEL_MAX = 40
REAUTH_TTL_SECONDS = 300
EMAIL_CHANGE_TTL_SECONDS = 24 * 3600
EMAIL_VERIFICATION_TTL_SECONDS = 24 * 3600
SMS_OTP_TTL_SECONDS = 10 * 60
CONTACT_SALT_ROTATE_DAYS = 90
CONTACT_SALT_ROTATE_SECONDS = CONTACT_SALT_ROTATE_DAYS * 24 * 3600
RISK_STEPUP_THRESHOLD = 60
RISK_BLOCK_THRESHOLD = 80
RISK_PROFILE_TTL_SECONDS = 30 * 24 * 3600

SKILL_SLUG_REGEX = re.compile(r"^[a-z0-9.+\-]{1,30}$")
ALLOWED_LINK_KINDS = {"github", "linkedin", "instagram", "website", "twitter"}
PHONE_E164_REGEX = re.compile(r"^\+[1-9]\d{7,14}$")


class IdentityPolicyError(ValueError):
	"""Raised when a policy constraint is violated."""

	def __init__(self, reason: str):
		super().__init__(reason)
		self.reason = reason


class IdentityRateLimitExceeded(IdentityPolicyError):
	"""Raised when a rate limit bucket is exhausted."""


class HandleConflict(IdentityPolicyError):
	"""Raised when handle reservation fails."""


class HandleFormatError(IdentityPolicyError):
	"""Raised when handle format is invalid."""


class EmailDomainMismatch(IdentityPolicyError):
	"""Raised when email domain does not match campus domain."""


class EmailConflict(IdentityPolicyError):
	"""Raised when an email is already associated to a verified account."""


class PasswordTooWeak(IdentityPolicyError):
	"""Raised when password requirements are not met."""


class TwoFAAlreadyEnabled(IdentityPolicyError):
	"""Raised when attempting to re-enable 2FA that's active."""


class TwoFANotEnabled(IdentityPolicyError):
	"""Raised when a 2FA-only operation is attempted without 2FA."""


class RecoveryCodeInvalid(IdentityPolicyError):
	"""Raised when recovery code validation fails."""


def normalise_email(email: str) -> str:
	return email.strip().lower()


def normalise_handle(handle: str) -> str:
	return handle.strip().lower()


def guard_handle_format(handle: str) -> None:
	if not HANDLE_REGEX.match(handle):
		raise HandleFormatError("handle_invalid")
	if handle in BLOCKED_HANDLES:
		raise HandleFormatError("handle_blocked")


def guard_password(password: str) -> None:
	if len(password) < PASSWORD_MIN_LEN:
		raise PasswordTooWeak("password_too_short")


def normalise_phone(e164: str) -> str:
	return e164.strip().replace(" ", "")


def guard_phone_number(e164: str) -> None:
	if not PHONE_E164_REGEX.fullmatch(e164):
		raise IdentityPolicyError("phone_invalid")


def guard_email_domain(email: str, campus: Campus | Mapping[str, str] | None) -> None:
	if not campus:
		return
	campus_domain: Optional[str]
	if isinstance(campus, Campus):
		campus_domain = campus.domain
	else:
		if isinstance(campus, Mapping):
			campus_domain = campus.get("domain")
		else:
			campus_domain = getattr(campus, "domain", None)
	if not campus_domain:
		return
	domain = email.split("@")[-1]
	if domain.lower() != campus_domain.lower():
		raise EmailDomainMismatch("email_domain_mismatch")


async def ensure_handle_available(conn: asyncpg.Connection, handle: str) -> None:
	exists = await conn.fetchval("SELECT 1 FROM users WHERE handle = $1", handle)
	if exists:
		raise HandleConflict("handle_taken")


async def ensure_email_available(conn: asyncpg.Connection, email: str) -> Optional[str]:
	row = await conn.fetchrow("SELECT id, email_verified FROM users WHERE email = $1", email)
	if not row:
		return None
	if row["email_verified"]:
		raise HandleConflict("email_taken")
	return str(row["id"])


async def reserve_handle(handle: str, user_id: str, ttl_seconds: int = 900) -> None:
	key = f"reserved:handle:{handle}"
	ok = await redis_client.set(key, user_id, nx=True, ex=ttl_seconds)
	if not ok:
		raise HandleConflict("handle_reserved")


async def release_handle(handle: str) -> None:
	await redis_client.delete(f"reserved:handle:{handle}")


async def _bucketed_limit(key: str, ttl: int, limit: int, reason: str) -> None:
	async with redis_client.pipeline(transaction=True) as pipe:
		pipe.incr(key)
		pipe.expire(key, ttl)
		count, _ = await pipe.execute()
	if int(count) > limit:
		raise IdentityRateLimitExceeded(reason)


async def enforce_register_rate(ip: str, *, now: float | None = None) -> None:
	now = now or time.time()
	bucket = time.strftime("%Y%m%d%H", time.gmtime(now))
	limit = 1000 if settings.is_dev() else REGISTER_PER_HOUR
	await _bucketed_limit(f"rl:auth:register:{ip}:{bucket}", 3600, limit, "register_rate")


async def enforce_verify_rate(email: str, *, now: float | None = None) -> None:
	now = now or time.time()
	bucket = time.strftime("%Y%m%d%H%M", time.gmtime(now))
	await _bucketed_limit(f"rl:auth:verify:{email}:{bucket}", 60, VERIFY_PER_MINUTE, "verify_rate")


async def enforce_login_rate(email: str, *, now: float | None = None) -> None:
	now = now or time.time()
	bucket = time.strftime("%Y%m%d%H%M", time.gmtime(now))
	limit = 1000 if settings.is_dev() else LOGIN_PER_MINUTE
	await _bucketed_limit(f"rl:auth:login:{email}:{bucket}", 60, limit, "login_rate")


async def enforce_resend_rate(email: str, *, now: float | None = None) -> None:
	now = now or time.time()
	bucket = time.strftime("%Y%m%d%H", time.gmtime(now))
	await _bucketed_limit(f"rl:auth:resend:{email}:{bucket}", 3600, RESEND_PER_HOUR, "resend_rate")


async def enforce_pwreset_request_rate(email: str, *, now: float | None = None) -> None:
	now = now or time.time()
	bucket = time.strftime("%Y%m%d%H", time.gmtime(now))
	await _bucketed_limit(
		f"rl:pwreset:request:{email}:{bucket}",
		3600,
		PWRESET_PER_HOUR,
		"pwreset_request_rate",
	)


async def enforce_pwreset_consume_rate(ip: str, *, now: float | None = None) -> None:
	now = now or time.time()
	bucket = time.strftime("%Y%m%d%H%M", time.gmtime(now))
	await _bucketed_limit(
		f"rl:pwreset:consume:{ip}:{bucket}",
		60,
		PWRESET_CONSUME_PER_MINUTE,
		"pwreset_consume_rate",
	)


async def enforce_twofa_verify_rate(user_id: str, *, now: float | None = None) -> None:
	now = now or time.time()
	bucket = time.strftime("%Y%m%d%H%M", time.gmtime(now))
	await _bucketed_limit(
		f"rl:2fa:verify:{user_id}:{bucket}",
		60,
		TWOFA_VERIFY_PER_MINUTE,
		"twofa_verify_rate",
	)


async def enforce_privacy_update_rate(user_id: str, *, now: float | None = None) -> None:
	now = now or time.time()
	bucket = time.strftime("%Y%m%d%H%M", time.gmtime(now))
	await _bucketed_limit(
		f"rl:privacy:update:{user_id}:{bucket}",
		60,
		PRIVACY_UPDATE_PER_MINUTE,
		"privacy_update_rate",
	)


async def enforce_export_request_rate(user_id: str, *, now: float | None = None) -> None:
	now = now or time.time()
	bucket = time.strftime("%Y%m%d%H", time.gmtime(now))
	await _bucketed_limit(
		f"rl:export:request:{user_id}:{bucket}",
		3600,
		EXPORT_REQUEST_PER_HOUR,
		"export_request_rate",
	)


async def enforce_deletion_request_rate(user_id: str, *, now: float | None = None) -> None:
	now = now or time.time()
	bucket = time.strftime("%Y%m%d", time.gmtime(now))
	await _bucketed_limit(
		f"rl:delete:request:{user_id}:{bucket}",
		24 * 3600,
		DELETION_REQUEST_PER_DAY,
		"delete_request_rate",
	)


async def enforce_verify_sso_rate(user_id: str, *, now: float | None = None) -> None:
	now = now or time.time()
	bucket = time.strftime("%Y%m%d%H", time.gmtime(now))
	await _bucketed_limit(
		f"rl:verify:sso:{user_id}:{bucket}",
		3600,
		VERIFY_SSO_PER_HOUR,
		"verify_sso_rate",
	)


async def enforce_verify_doc_rate(user_id: str, *, now: float | None = None) -> None:
	now = now or time.time()
	bucket = time.strftime("%Y%m%d%H", time.gmtime(now))
	await _bucketed_limit(
		f"rl:verify:doc:{user_id}:{bucket}",
		3600,
		VERIFY_DOC_PER_HOUR,
		"verify_doc_rate",
	)


async def enforce_interest_update_rate(user_id: str, *, now: float | None = None) -> None:
	now = now or time.time()
	bucket = time.strftime("%Y%m%d%H%M", time.gmtime(now))
	await _bucketed_limit(
		f"rl:interests:update:{user_id}:{bucket}",
		60,
		INTEREST_UPDATE_PER_MINUTE,
		"interests_update_rate",
	)


async def enforce_skill_update_rate(user_id: str, *, now: float | None = None) -> None:
	now = now or time.time()
	bucket = time.strftime("%Y%m%d%H%M", time.gmtime(now))
	await _bucketed_limit(
		f"rl:skills:update:{user_id}:{bucket}",
		60,
		SKILL_UPDATE_PER_MINUTE,
		"skills_update_rate",
	)


async def enforce_link_update_rate(user_id: str, *, now: float | None = None) -> None:
	now = now or time.time()
	bucket = time.strftime("%Y%m%d%H%M", time.gmtime(now))
	await _bucketed_limit(
		f"rl:links:update:{user_id}:{bucket}",
		60,
		LINK_UPDATE_PER_MINUTE,
		"links_update_rate",
	)


async def enforce_profile_rebuild_rate(user_id: str, *, now: float | None = None) -> None:
	now = now or time.time()
	bucket = time.strftime("%Y%m%d%H", time.gmtime(now))
	await _bucketed_limit(
		f"rl:profile:rebuild:{user_id}:{bucket}",
		3600,
		PROFILE_REBUILD_PER_HOUR,
		"profile_rebuild_rate",
	)


async def enforce_rbac_grant_rate(actor_id: str, *, now: float | None = None) -> None:
	now = now or time.time()
	bucket = time.strftime("%Y%m%d%H%M", time.gmtime(now))
	await _bucketed_limit(
		f"rl:rbac:grant:{actor_id}:{bucket}",
		60,
		30,
		"rbac_grant_rate",
	)


async def enforce_flags_update_rate(actor_id: str, *, now: float | None = None) -> None:
	now = now or time.time()
	bucket = time.strftime("%Y%m%d%H%M", time.gmtime(now))
	await _bucketed_limit(
		f"rl:flags:update:{actor_id}:{bucket}",
		60,
		60,
		"flags_update_rate",
	)


async def enforce_consent_update_rate(user_id: str, *, now: float | None = None) -> None:
	now = now or time.time()
	bucket = time.strftime("%Y%m%d%H%M", time.gmtime(now))
	await _bucketed_limit(
		f"rl:consent:update:{user_id}:{bucket}",
		60,
		20,
		"consent_update_rate",
	)


async def enforce_passkey_register_rate(user_id: str, *, now: float | None = None) -> None:
	now = now or time.time()
	bucket = time.strftime("%Y%m%d%H", time.gmtime(now))
	await _bucketed_limit(
		f"rl:passkeys:register:{user_id}:{bucket}",
		3600,
		PASSKEY_REGISTER_PER_HOUR,
		"passkey_register_rate",
	)


async def enforce_passkey_auth_rate(user_id: str, *, now: float | None = None) -> None:
	now = now or time.time()
	bucket = time.strftime("%Y%m%d%H%M", time.gmtime(now))
	await _bucketed_limit(
		f"rl:passkeys:authenticate:{user_id}:{bucket}",
		60,
		PASSKEY_AUTH_PER_MINUTE,
		"passkey_auth_rate",
	)


async def enforce_account_link_start_rate(user_id: str, *, now: float | None = None) -> None:
	now = now or time.time()
	bucket = time.strftime("%Y%m%d%H", time.gmtime(now))
	await _bucketed_limit(
		f"rl:link:start:{user_id}:{bucket}",
		3600,
		ACCOUNT_LINK_PER_HOUR,
		"account_link_rate",
	)


async def enforce_email_change_request_rate(user_id: str, *, now: float | None = None) -> None:
	now = now or time.time()
	bucket = time.strftime("%Y%m%d%H", time.gmtime(now))
	await _bucketed_limit(
		f"rl:emailchange:req:{user_id}:{bucket}",
		3600,
		EMAIL_CHANGE_PER_HOUR,
		"email_change_rate",
	)


async def enforce_phone_sms_rate(user_id: str, *, now: float | None = None) -> None:
	now = now or time.time()
	bucket = time.strftime("%Y%m%d%H", time.gmtime(now))
	await _bucketed_limit(
		f"rl:phone:sms:{user_id}:{bucket}",
		3600,
		PHONE_SMS_PER_HOUR,
		"phone_sms_rate",
	)


def normalise_device_label(label: str | None) -> str:
	if not label:
		return ""
	trimmed = label.strip()
	if len(trimmed) > DEVICE_LABEL_MAX:
		trimmed = trimmed[:DEVICE_LABEL_MAX]
	return trimmed


def guard_device_label(label: str) -> None:
	if len(label) > DEVICE_LABEL_MAX:
		raise IdentityPolicyError("device_label_too_long")


def guard_passkey_limit(count: int) -> None:
	if count >= MAX_PASSKEYS_PER_USER:
		raise IdentityPolicyError("passkeys_limit")


def _reauth_key(user_id: str) -> str:
	return f"auth:reauth:{user_id}"


async def stash_reauth_token(user_id: str, token: str, ttl: int = REAUTH_TTL_SECONDS) -> None:
	await redis_client.set(_reauth_key(user_id), token, ex=ttl)


async def verify_recent_reauth(user_id: str, token: str | None) -> None:
	if not token:
		raise IdentityPolicyError("reauth_required")
	stored = await redis_client.get(_reauth_key(user_id))
	if stored != token:
		raise IdentityPolicyError("reauth_invalid")


def validate_profile_patch(payload: Mapping[str, object]) -> None:
	display = payload.get("display_name")
	if isinstance(display, str) and len(display) > DISPLAY_MAX_LEN:
		raise IdentityPolicyError("display_too_long")
	bio = payload.get("bio")
	if isinstance(bio, str) and len(bio) > BIO_MAX_LEN:
		raise IdentityPolicyError("bio_too_long")
	status = payload.get("status")
	if isinstance(status, Mapping):
		text = status.get("text")
		if isinstance(text, str) and len(text) > STATUS_TEXT_MAX:
			raise IdentityPolicyError("status_text_too_long")
	major = payload.get("major")
	if isinstance(major, str) and len(major.strip()) > MAJOR_MAX_LEN:
		raise IdentityPolicyError("major_too_long")
	graduation_year = payload.get("graduation_year")
	if graduation_year is not None:
		try:
			year = int(graduation_year) if graduation_year != "" else None
		except (TypeError, ValueError):
			raise IdentityPolicyError("graduation_year_invalid")
		if year is not None and not (GRAD_YEAR_MIN <= year <= GRAD_YEAR_MAX):
			raise IdentityPolicyError("graduation_year_invalid")
	passions = payload.get("passions")
	if passions is not None:
		if not isinstance(passions, (list, tuple)):
			raise IdentityPolicyError("passions_invalid")
		if len(passions) > PASSIONS_MAX:
			raise IdentityPolicyError("passions_limit")
		seen: set[str] = set()
		for entry in passions:
			if not isinstance(entry, str):
				raise IdentityPolicyError("passion_invalid")
			trimmed = entry.strip()
			if not trimmed or len(trimmed) < PASSION_MIN_LEN or len(trimmed) > PASSION_MAX_LEN:
				raise IdentityPolicyError("passion_invalid")
			key = trimmed.casefold()
			if key in seen:
				raise IdentityPolicyError("passion_duplicate")
			seen.add(key)


def normalise_skill_name(name: str) -> str:
	slug = name.strip().lower()
	if not slug or not SKILL_SLUG_REGEX.fullmatch(slug):
		raise IdentityPolicyError("skill_name_invalid")
	return slug


def validate_skill(display: str, proficiency: int) -> None:
	if not display or len(display.strip()) > 40:
		raise IdentityPolicyError("skill_display_invalid")
	if not (1 <= proficiency <= 5):
		raise IdentityPolicyError("skill_proficiency_invalid")


def validate_link(kind: str, url: str) -> None:
	kind_norm = kind.strip().lower()
	if kind_norm not in ALLOWED_LINK_KINDS:
		raise IdentityPolicyError("link_kind_invalid")
	parsed = urlparse(url.strip())
	if parsed.scheme != "https" or not parsed.netloc:
		raise IdentityPolicyError("link_url_invalid")
	if len(url) > 200:
		raise IdentityPolicyError("link_url_too_long")


def validate_education(program: str, year: Optional[int]) -> None:
	if len(program.strip()) > 80:
		raise IdentityPolicyError("education_program_invalid")
	if year is not None and not (1 <= year <= 10):
		raise IdentityPolicyError("education_year_invalid")

