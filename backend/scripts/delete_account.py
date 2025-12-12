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
			# Delete all related data from all tables that reference users
			# Order matters due to foreign key constraints
			
			# Chat/messaging related
			await conn.execute("DELETE FROM room_receipts WHERE user_id = $1", user_id)
			await conn.execute("DELETE FROM room_messages WHERE sender_id = $1", user_id)
			await conn.execute("DELETE FROM room_members WHERE user_id = $1", user_id)
			await conn.execute("DELETE FROM rooms WHERE creator_id = $1", user_id)
			
			# Social/friends related
			await conn.execute("DELETE FROM friendships WHERE user_id = $1 OR friend_id = $1", user_id)
			await conn.execute("DELETE FROM invitations WHERE from_user_id = $1 OR to_user_id = $1", user_id)
			await conn.execute("DELETE FROM blocks WHERE blocker_id = $1 OR blocked_id = $1", user_id)
			
			# Meetups related
			await conn.execute("DELETE FROM meetup_participants WHERE user_id = $1", user_id)
			await conn.execute("DELETE FROM meetups WHERE creator_user_id = $1", user_id)
			
			# Profile related
			await conn.execute("DELETE FROM user_skills WHERE user_id = $1", user_id)
			await conn.execute("DELETE FROM user_interests WHERE user_id = $1", user_id)
			await conn.execute("DELETE FROM user_courses WHERE user_id = $1", user_id)
			await conn.execute("DELETE FROM social_links WHERE user_id = $1", user_id)
			await conn.execute("DELETE FROM education WHERE user_id = $1", user_id)
			await conn.execute("DELETE FROM public_profiles WHERE user_id = $1", user_id)
			
			# Auth related
			await conn.execute("DELETE FROM email_verifications WHERE user_id = $1", user_id)
			await conn.execute("DELETE FROM email_change_requests WHERE user_id = $1", user_id)
			await conn.execute("DELETE FROM password_resets WHERE user_id = $1", user_id)
			await conn.execute("DELETE FROM sessions WHERE user_id = $1", user_id)
			await conn.execute("DELETE FROM twofa WHERE user_id = $1", user_id)
			await conn.execute("DELETE FROM recovery_codes WHERE user_id = $1", user_id)
			await conn.execute("DELETE FROM authenticators WHERE user_id = $1", user_id)
			await conn.execute("DELETE FROM trusted_devices WHERE user_id = $1", user_id)
			await conn.execute("DELETE FROM oauth_identities WHERE user_id = $1", user_id)
			await conn.execute("DELETE FROM user_phones WHERE user_id = $1", user_id)
			await conn.execute("DELETE FROM contact_optin WHERE user_id = $1", user_id)
			
			# Verification/trust related
			await conn.execute("DELETE FROM verification_audit WHERE user_id = $1", user_id)
			await conn.execute("DELETE FROM verifications WHERE user_id = $1", user_id)
			await conn.execute("DELETE FROM trust_profiles WHERE user_id = $1", user_id)
			
			# Leaderboard/gamification related
			await conn.execute("DELETE FROM badges WHERE user_id = $1", user_id)
			await conn.execute("DELETE FROM streaks WHERE user_id = $1", user_id)
			await conn.execute("DELETE FROM lb_daily WHERE user_id = $1", user_id)
			
			# Moderation related
			await conn.execute("DELETE FROM mod_reputation_event WHERE user_id = $1", user_id)
			await conn.execute("DELETE FROM mod_user_reputation WHERE user_id = $1", user_id)
			await conn.execute("DELETE FROM mod_user_restriction WHERE user_id = $1", user_id)
			await conn.execute("DELETE FROM mod_device WHERE user_id = $1", user_id)
			await conn.execute("DELETE FROM mod_appeal WHERE user_id = $1", user_id)
			await conn.execute("DELETE FROM mod_report WHERE reporter_id = $1 OR target_id = $1", user_id)
			await conn.execute("DELETE FROM mod_case WHERE user_id = $1", user_id)
			
			# Settings/preferences related
			await conn.execute("DELETE FROM notification_prefs WHERE user_id = $1", user_id)
			await conn.execute("DELETE FROM audit_log WHERE user_id = $1", user_id)
			
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
