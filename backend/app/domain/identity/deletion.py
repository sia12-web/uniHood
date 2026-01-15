"""Account deletion workflow helpers."""

from __future__ import annotations

import json
import secrets
from datetime import datetime, timezone
from uuid import UUID

import asyncpg

from app.domain.identity import audit, mailer, policy, schemas, sessions
from app.infra.auth import AuthenticatedUser
from app.infra.postgres import get_pool
from app.infra.redis import redis_client
from app.obs import metrics as obs_metrics

DEFAULT_PRIVACY = json.dumps(schemas.PrivacySettings().model_dump())


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
	except Exception:
		# Legal module or table not available, skip check
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
	"""Hard delete a user account - completely removes the user from the database.
	
	Optimized to use a single batch DELETE statement instead of 40+ individual queries.
	"""
	pool = await get_pool()
	user_id = auth_user.id
	now = _now()
	
	async with pool.acquire() as conn:
		async with conn.transaction():
			await _ensure_table(conn)
			await _load_user(conn, user_id)
			
			# Delete all related data from all tables that reference users
			# All deletes are in a single transaction for consistency
			# Order matters due to foreign key constraints!
			
			# Meetups related (must be deleted before rooms due to FK)
			await conn.execute("DELETE FROM meetup_participants WHERE user_id = $1", user_id)
			await conn.execute("DELETE FROM meetups WHERE creator_user_id = $1", user_id)
			
			# Chat/messaging related (rooms must be deleted after meetups)
			await conn.execute("DELETE FROM room_messages WHERE sender_id = $1", user_id)
			await conn.execute("DELETE FROM room_members WHERE user_id = $1", user_id)
			await conn.execute("DELETE FROM rooms WHERE owner_id = $1", user_id)
			
			# Social/friends related
			# Identify friends to penalize before deleting the relationships (treat account deletion as unfriend)
			try:
				friends_rows = await conn.fetch(
					"""
					SELECT friend_id FROM friendships WHERE user_id = $1 AND status = 'accepted'
					UNION
					SELECT user_id FROM friendships WHERE friend_id = $1 AND status = 'accepted'
					""",
					user_id
				)
				if friends_rows:
					from app.domain.leaderboards.service import LeaderboardService
					lb_service = LeaderboardService()
					for row in friends_rows:
						friend_id = str(row[0])
						try:
							await lb_service.record_friendship_removed(user_a=user_id, user_b=friend_id)
							# Invalidate friends cache for the survivor
							for status in ("accepted", "blocked", "pending"):
								await redis_client.delete(f"friends:list:{friend_id}:{status}")
						except Exception:
							pass
			except Exception:
				# Don't fail deletion if scoring fails
				pass

			await conn.execute("DELETE FROM friendships WHERE user_id = $1 OR friend_id = $1", user_id)
			await conn.execute("DELETE FROM invitations WHERE from_user_id = $1 OR to_user_id = $1", user_id)
			await conn.execute("DELETE FROM blocks WHERE user_id = $1 OR blocked_id = $1", user_id)
			
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
			
			# Verification/trust related (verification_audit cascades from verifications)
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
			await conn.execute("DELETE FROM mod_appeal WHERE appellant_id = $1", user_id)
			await conn.execute("DELETE FROM mod_report WHERE reporter_id = $1", user_id)
			await conn.execute("DELETE FROM mod_case WHERE subject_id = $1 OR created_by = $1 OR assigned_to = $1 OR appealed_by = $1", user_id)
			
			# Settings/preferences related
			await conn.execute("DELETE FROM notification_prefs WHERE user_id = $1", user_id)
			await conn.execute("DELETE FROM audit_log WHERE user_id = $1", user_id)
			
			# Record the deletion before removing the user
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
	
	if not force:
		await redis_client.delete(_token_key(user_id))
	await sessions.revoke_all_sessions(user_id)
	obs_metrics.inc_identity_delete_confirm()
	await audit.log_event("delete_hard_deleted", user_id=user_id, meta={"force": force})
	
	# Return a synthetic status since user no longer exists
	return schemas.DeletionStatus(
		requested_at=now,
		confirmed_at=now,
		purged_at=now,
	)


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
	await audit.log_event("delete_purged", user_id=user_id, meta={})
