"""Utility script to verify a newly registered account.

Given an email and password, this marks the corresponding user as email
verified and sets the password hash so the user can sign in immediately.
"""

from __future__ import annotations

import argparse
import asyncio
from datetime import datetime, timezone

from app.domain.identity import policy
from app.domain.identity.policy import IdentityPolicyError
from app.infra.password import PASSWORD_HASHER
from app.infra.postgres import get_pool


def _parse_args() -> argparse.Namespace:
	parser = argparse.ArgumentParser(description="Verify a Divan account")
	parser.add_argument("email", help="Campus email address for the account")
	parser.add_argument("password", help="Password to set for the account")
	return parser.parse_args()


async def verify_account(email: str, password: str) -> None:
	normalised_email = policy.normalise_email(email)
	try:
		policy.guard_password(password)
	except IdentityPolicyError as exc:
		raise SystemExit(f"Password failed policy checks: {exc.reason}") from exc
	password_hash = PASSWORD_HASHER.hash(password)
	pool = await get_pool()
	async with pool.acquire() as conn:
		row = await conn.fetchrow(
			"""
			SELECT id, email_verified
			FROM users
			WHERE email = $1
			""",
			normalised_email,
		)
		if not row:
			raise SystemExit(f"No user found for email {normalised_email}")
		user_id = str(row["id"])
		now = datetime.now(timezone.utc)
		await conn.execute(
			"""
			UPDATE users
			SET password_hash = $1,
				email_verified = TRUE,
				updated_at = $2
			WHERE id = $3
			""",
			password_hash,
			now,
			user_id,
		)
		await conn.execute("DELETE FROM email_verifications WHERE user_id = $1", user_id)
	print(f"Account for {normalised_email} marked as verified.")


def main() -> None:
	args = _parse_args()
	asyncio.run(verify_account(args.email, args.password))


if __name__ == "__main__":
	main()
