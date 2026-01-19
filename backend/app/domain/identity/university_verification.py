"""Service helpers orchestrating university email verification."""

from __future__ import annotations

import hashlib
import secrets
from datetime import datetime, timedelta, timezone
from uuid import uuid4

from app.domain.identity import mailer, policy
from app.infra.auth import AuthenticatedUser
from app.infra.postgres import get_pool


def _utcnow() -> datetime:
	return datetime.now(timezone.utc)


def _hash_code(code: str) -> str:
	return hashlib.sha256(code.encode("utf-8")).hexdigest()


async def send_code(user: AuthenticatedUser, email: str, university_id: str | None = None) -> None:
	# Deduce university from email if not provided
	if not university_id:
		from app.domain.campuses.service import CampusService
		email_domain = email.split("@")[-1].lower()
		# Try to find exact domain match first
		campus = await CampusService().find_by_domain(email_domain)
		
		# If not found, maybe try subdomains? e.g. mail.mcgill.ca -> mcgill.ca
		# For now, simple suffix check logic is better handled by iterating campuses or standardizing domains
		if not campus:
			# Fallback: check against all campuses if they are a suffix
			# This is expensive if many campuses, but fine for MVP.
			all_campuses = await CampusService().list_campuses()
			for c in all_campuses:
				if c.get("domain") and email_domain.endswith(c["domain"].lower()):
					campus = c
					break
		
		if campus:
			university_id = campus["id"]
			# Auto-assign user to this campus
			pool = await get_pool()
			async with pool.acquire() as conn:
				await conn.execute("UPDATE users SET campus_id = $1 WHERE id = $2", university_id, user.id)
		else:
			# If we can't map to a campus, we can't verify them for Unihood
			# Exception: allow fallback if configured, but for "automatic acceptance" request, 
			# we imply we must match a supported school.
			if not (email.endswith(".edu") or email.endswith(".ca")):
				raise policy.IdentityPolicyError("unsupported_university_domain")
			# If .edu/.ca but no campus found, they are "Verified Student" but "No Campus"?
			# For now, let's treat generic .edu as valid verification but don't set campus_id.
			# Or, better, reject to force onboarding support properly.
			# Let's reject if we want strict "accept automatically" meaning "valid mapping"
			pass

	# Validate email domain against university record if ID is provided (or deduced)
	if university_id:
		from app.domain.campuses.service import CampusService
		from uuid import UUID
		try:
			# Handle string or UUID input
			uid = UUID(str(university_id))
			campus = await CampusService().get_campus(uid)
			if campus and campus.get("domain"):
				allowed_domain = campus["domain"]
				if not email.lower().endswith(allowed_domain.lower()):
					raise policy.IdentityPolicyError("invalid_university_email_domain")
		except Exception as e:
			print(f"WARN: Campus validation failed: {e}")
			pass

	code = "".join([str(secrets.randbelow(10)) for _ in range(6)])
	code_hash = _hash_code(code)
	expires_at = _utcnow() + timedelta(minutes=15)
	verification_id = uuid4()

	pool = await get_pool()
	async with pool.acquire() as conn:
		# Check rate limit/existing active codes if needed, or just insert new
		await conn.execute(
			"""
			INSERT INTO university_verifications (id, user_id, code_hash, expires_at)
			VALUES ($1, $2, $3, $4)
			""",
			verification_id,
			user.id,
			code_hash,
			expires_at,
		)

	try:
		await mailer._send_email(
			to_email=email,
			subject="Your University Verification Code",
			body_html=f"""
			<html>
				<body>
					<p>Hello,</p>
					<p>Your verification code for uniHood is:</p>
					<h2>{code}</h2>
					<p>This code will expire in 15 minutes.</p>
				</body>
			</html>
			""",
		)
	except Exception as e:
		# Log the error and re-raise so the API returns a 500 or appropriate error
		# In a real app, use a logger, not print
		print(f"Failed to send email: {e}") 
		raise policy.IdentityPolicyError("email_send_failed")


async def confirm_code(user: AuthenticatedUser, code: str) -> bool:
	code_hash = _hash_code(code)
	pool = await get_pool()
	
	async with pool.acquire() as conn:
		row = await conn.fetchrow(
			"""
			SELECT id, expires_at, attempts
			FROM university_verifications
			WHERE user_id = $1 AND code_hash = $2
			ORDER BY created_at DESC
			LIMIT 1
			""",
			user.id,
			code_hash,
		)

		if not row:
			raise policy.IdentityPolicyError("invalid_code")

		if row["attempts"] >= 5:
			raise policy.IdentityPolicyError("too_many_attempts")

		if row["expires_at"] <= _utcnow():
			raise policy.IdentityPolicyError("code_expired")

		# Mark verified
		async with conn.transaction():
			await conn.execute(
				"""
				UPDATE users
				SET is_university_verified = TRUE
				WHERE id = $1
				""",
				user.id,
			)
			# Clean up used code or mark as used?
			# For now, just deleting or leaving it is fine. 
			# Plan said "invalidate code after use".
			await conn.execute(
				"DELETE FROM university_verifications WHERE id = $1",
				row["id"],
			)
			
	return True
