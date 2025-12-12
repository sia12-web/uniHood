"""Utility script to anonymize and delete a Divan account on demand."""

from __future__ import annotations

import argparse
import asyncio
import json
from datetime import datetime, timezone

from app.domain.identity import deletion, policy, sessions
from app.domain.identity.policy import IdentityPolicyError
from app.infra.postgres import get_pool
from app.infra.redis import redis_client


def _parse_args() -> argparse.Namespace:
	parser = argparse.ArgumentParser(description="Delete a Divan account")
	parser.add_argument("email", help="Email associated with the account")
	parser.add_argument("username", help="Current username/handle for the account")
	return parser.parse_args()


async def delete_account(email: str, username: str) -> None:
	normalised_email = policy.normalise_email(email)
	try:
		normalised_handle = policy.normalise_handle(username)
	except IdentityPolicyError as exc:
		raise SystemExit(f"Username failed policy checks: {exc.reason}") from exc

	pool = await get_pool()
	async with pool.acquire() as conn:
		row = await conn.fetchrow(
			"""
			SELECT id, handle
			FROM users
			WHERE email = $1
			""",
			normalised_email,
		)
		if not row:
			raise SystemExit(f"No user found for email {normalised_email}")
		stored_handle = row["handle"]
		if stored_handle != normalised_handle:
			raise SystemExit(
				f"Username mismatch: expected {stored_handle}, received {normalised_handle}. Aborting."
			)
		user_id = str(row["id"])
		token_key = deletion._token_key(user_id)
		now = datetime.now(timezone.utc)
		async with conn.transaction():
			# Delete all related data first
			await conn.execute("DELETE FROM email_verifications WHERE user_id = $1", user_id)
			await conn.execute("DELETE FROM friendships WHERE user_id = $1 OR friend_id = $1", user_id)
			await conn.execute("DELETE FROM invitations WHERE from_user_id = $1 OR to_user_id = $1", user_id)
			
			# Record the deletion
			await conn.execute(
				"""
				INSERT INTO account_deletions (user_id, requested_at, confirmed_at, purged_at)
				VALUES ($1, $2, $2, $2)
				ON CONFLICT (user_id)
				DO UPDATE SET confirmed_at = $2, purged_at = $2
				""",
				user_id,
				now,
			)
			
			# Hard delete the user - completely remove from database
			await conn.execute("DELETE FROM users WHERE id = $1", user_id)
	
	await redis_client.delete(token_key)
	await sessions.revoke_all_sessions(user_id)
	print(f"Account {normalised_email} permanently deleted.")


def main() -> None:
	args = _parse_args()
	asyncio.run(delete_account(args.email, args.username))


if __name__ == "__main__":
	main()
