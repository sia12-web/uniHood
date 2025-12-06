"""Service layer implementing Phase 2 social flows."""

from __future__ import annotations

import logging
from datetime import datetime, timedelta, timezone
from typing import List, Sequence
from uuid import UUID, uuid4

import asyncpg

from app.domain.social import audit, policy, sockets
from app.domain.social.exceptions import (
	InviteAlreadySent,
	InviteForbidden,
	InviteGone,
	InviteNotFound,
)
from app.domain.social.models import INVITE_EXPIRES_DAYS, InvitationStatus
from app.domain.social.schemas import FriendRow, FriendUpdatePayload, InviteSummary, InviteUpdatePayload
from app.infra.auth import AuthenticatedUser
from app.domain.leaderboards.service import LeaderboardService
from app.domain.identity import mailer as identity_mailer
from app.domain.identity import notifications as identity_notifications

logger = logging.getLogger(__name__)
_leaderboards = LeaderboardService()
from app.infra.postgres import get_pool
from datetime import datetime
from typing import Tuple, Optional

def _record_to_summary(record: asyncpg.Record) -> InviteSummary:
	return InviteSummary(
		id=record["id"],
		from_user_id=record["from_user_id"],
		to_user_id=record["to_user_id"],
		status=record["status"],
		created_at=record["created_at"],
		updated_at=record["updated_at"],
		expires_at=record["expires_at"],
		from_handle=record.get("from_handle"),
		from_display_name=record.get("from_display_name"),
		to_handle=record.get("to_handle"),
		to_display_name=record.get("to_display_name"),
	)


def _record_to_friend_row(record: asyncpg.Record) -> FriendRow:
	return FriendRow(
		user_id=record["user_id"],
		friend_id=record["friend_id"],
		status=record["status"],
		created_at=record["created_at"],
		friend_handle=record.get("friend_handle"),
		friend_display_name=record.get("friend_display_name"),
	)


_INVITE_WITH_PROFILES_SQL = """
SELECT i.*,
	sender.handle AS from_handle,
	COALESCE(sender.display_name, sender.handle) AS from_display_name,
	recipient.handle AS to_handle,
	COALESCE(recipient.display_name, recipient.handle) AS to_display_name
FROM invitations i
JOIN users sender ON sender.id = i.from_user_id
JOIN users recipient ON recipient.id = i.to_user_id
WHERE i.id = $1
"""


async def _fetch_invite_with_profiles(conn: asyncpg.Connection, invite_id: str) -> asyncpg.Record:
	return await conn.fetchrow(_INVITE_WITH_PROFILES_SQL, invite_id)


async def _summarize_invite(conn: asyncpg.Connection, invite_id: UUID | str) -> InviteSummary:
	record = await _fetch_invite_with_profiles(conn, str(invite_id))
	if not record:
		raise InviteNotFound()
	return _record_to_summary(record)


async def get_invite_summary(invite_id: UUID | str) -> InviteSummary:
	pool = await get_pool()
	async with pool.acquire() as conn:
		return await _summarize_invite(conn, invite_id)


async def _cancel_other_invites(
	conn: asyncpg.Connection,
	user_a: str,
	user_b: str,
	exclude: Sequence[UUID] | None = None,
) -> None:
	await policy.cancel_other_open_between_pair(conn, user_a, user_b, [str(e) for e in exclude or []])


async def _emit_invite_new(invite: InviteSummary) -> None:
	payload = invite.model_dump(mode="json")
	await sockets.emit_invite_new(str(invite.to_user_id), payload)


async def _send_invite_email_notification(invite: InviteSummary) -> None:
	"""Send email notification to recipient if they have invites notifications enabled."""
	try:
		recipient_id = str(invite.to_user_id)
		# Check notification preferences
		prefs = await identity_notifications.get_preferences(recipient_id)
		if not prefs.invites:
			logger.debug("User %s has invite notifications disabled", recipient_id[:8])
			return
		
		# Fetch recipient's email
		pool = await get_pool()
		async with pool.acquire() as conn:
			row = await conn.fetchrow("SELECT email FROM users WHERE id = $1", recipient_id)
			if not row or not row["email"]:
				logger.warning("No email found for user %s, skipping invite notification", recipient_id[:8])
				return
			
			recipient_email = row["email"]
		
		# Send the email
		await identity_mailer.send_friend_invite_notification(
			to_email=recipient_email,
			from_display_name=invite.from_display_name or "Someone",
			from_handle=invite.from_handle,
			recipient_user_id=recipient_id,
		)
		logger.info("Sent friend invite email to user %s", recipient_id[:8])
	except Exception as e:
		# Don't let email errors break the invite flow
		logger.error("Failed to send invite email notification: %s", str(e))


async def _emit_invite_update(invite: InviteSummary) -> None:
	payload = InviteUpdatePayload(id=invite.id, status=invite.status).model_dump(mode="json")
	await sockets.emit_invite_update(str(invite.from_user_id), payload)
	await sockets.emit_invite_update(str(invite.to_user_id), payload)


async def _emit_friend_update_pair(user_a: str, user_b: str, status: str) -> None:
	payload_a = FriendUpdatePayload(user_id=user_a, friend_id=user_b, status=status).model_dump(mode="json")
	payload_b = FriendUpdatePayload(user_id=user_b, friend_id=user_a, status=status).model_dump(mode="json")
	await sockets.emit_friend_update(user_a, payload_a)
	await sockets.emit_friend_update(user_b, payload_b)


async def send_invite(auth_user: AuthenticatedUser, to_user_id: UUID, campus_id: UUID | None) -> InviteSummary:
	sender_id = str(auth_user.id)
	target_id = str(to_user_id)

	policy.guard_not_self(sender_id, target_id)
	await policy.enforce_invite_limits(sender_id)

	pool = await get_pool()
	async with pool.acquire() as conn:
		await policy.ensure_users_exist_conn(conn, sender_id, target_id)
		await policy.ensure_not_blocked(conn, sender_id, target_id)
		await policy.ensure_not_already_friends(conn, sender_id, target_id)

		open_ab = await policy.get_open_invite(conn, sender_id, target_id)
		if open_ab:
			invite = _record_to_summary(open_ab)
			audit.inc_send_reject("already_sent")
			raise InviteAlreadySent()

		open_ba = await policy.get_open_invite(conn, target_id, sender_id)

		expires_at = datetime.now(timezone.utc) + timedelta(days=INVITE_EXPIRES_DAYS)

		if open_ba:
			async with conn.transaction():
				updated_ba = await conn.fetchrow(
					"""
					UPDATE invitations
					SET status='accepted', updated_at = NOW()
					WHERE id=$1
					RETURNING *
					""",
					open_ba["id"],
				)
				updated_id = updated_ba["id"]
				new_id = uuid4()
				await conn.execute(
					"""
					INSERT INTO invitations (id, from_user_id, to_user_id, status, campus_id, expires_at)
					VALUES ($1, $2, $3, 'accepted', $4, $5)
					""",
					new_id,
					sender_id,
					target_id,
					str(campus_id) if campus_id else None,
					expires_at,
				)
				await policy.upsert_friendships_bidirectional(conn, sender_id, target_id, status="accepted")
				await _cancel_other_invites(conn, sender_id, target_id, exclude=[updated_id, new_id])

			summary = await _summarize_invite(conn, new_id)
			other_summary = await _summarize_invite(conn, updated_id)
			audit.inc_invite_sent("auto_accept")
			audit.inc_invite_accept()
			await audit.log_invite_event(
				"accepted_auto",
				{
					"invite_id": str(summary.id),
					"from": sender_id,
					"to": target_id,
					"status": summary.status,
				},
			)
			await audit.log_friend_event(
				"accepted",
				{"user_id": sender_id, "friend_id": target_id, "status": "accepted"},
			)
			await _emit_invite_update(summary)
			await _emit_invite_update(other_summary)
			await _emit_friend_update_pair(sender_id, target_id, "accepted")
			return summary

		new_id = uuid4()
		async with conn.transaction():
			await conn.execute(
				"""
				INSERT INTO invitations (id, from_user_id, to_user_id, status, campus_id, expires_at)
				VALUES ($1, $2, $3, 'sent', $4, $5)
				""",
				new_id,
				sender_id,
				target_id,
				str(campus_id) if campus_id else None,
				expires_at,
			)

		summary = await _summarize_invite(conn, new_id)
		audit.inc_invite_sent("sent")
		await audit.log_invite_event(
			"sent",
			{
				"invite_id": str(summary.id),
				"from": sender_id,
				"to": target_id,
				"status": summary.status,
			},
		)
		await _emit_invite_new(summary)
		# Send email notification to recipient (non-blocking)
		await _send_invite_email_notification(summary)
		return summary


async def _load_invitation(conn: asyncpg.Connection, invite_id: UUID) -> asyncpg.Record:
	record = await conn.fetchrow("SELECT * FROM invitations WHERE id = $1", invite_id)
	if not record:
		raise InviteNotFound()
	return record


async def _ensure_can_accept(invite: asyncpg.Record, auth_user: AuthenticatedUser) -> None:
	if str(invite["to_user_id"]) != str(auth_user.id):
		raise InviteForbidden("not_recipient")
	if invite["status"] != "sent":
		raise InviteGone("not_pending")
	if invite["expires_at"] <= datetime.now(timezone.utc):
		raise InviteGone("expired")


async def accept_invite(auth_user: AuthenticatedUser, invite_id: UUID) -> InviteSummary:
	pool = await get_pool()
	async with pool.acquire() as conn:
		invite = await _load_invitation(conn, invite_id)
		await _ensure_can_accept(invite, auth_user)

		async with conn.transaction():
			updated = await conn.fetchrow(
				"""
				UPDATE invitations
				SET status='accepted', updated_at = NOW()
				WHERE id = $1
				RETURNING *
				""",
				invite_id,
			)
			await policy.upsert_friendships_bidirectional(
				conn,
				str(invite["from_user_id"]),
				str(invite["to_user_id"]),
				status="accepted",
			)
			await _cancel_other_invites(
				conn,
				str(invite["from_user_id"]),
				str(invite["to_user_id"]),
				exclude=[invite_id],
			)
		# Summarize while the connection is still held to avoid using a released connection
		summary = await _summarize_invite(conn, updated["id"])
	
	# Record friendship for leaderboard scoring (with anti-cheat)
	try:
		await _leaderboards.record_friendship_accepted(
			user_a=str(summary.from_user_id),
			user_b=str(summary.to_user_id),
		)
	except Exception:
		logger.exception("Failed to record friendship for leaderboards")
	
	audit.inc_invite_accept()
	await audit.log_invite_event(
		"accepted",
		{
			"invite_id": str(summary.id),
			"from": str(summary.from_user_id),
			"to": str(summary.to_user_id),
			"status": summary.status,
		},
	)
	await audit.log_friend_event(
		"accepted",
		{
			"user_id": str(summary.from_user_id),
			"friend_id": str(summary.to_user_id),
			"status": "accepted",
		},
	)
	await _emit_invite_update(summary)
	await _emit_friend_update_pair(str(summary.from_user_id), str(summary.to_user_id), "accepted")
	# Invalidate friends cache for both users
	await _invalidate_friends_cache(str(summary.from_user_id))
	await _invalidate_friends_cache(str(summary.to_user_id))
	return summary


async def _update_invite_status(
	auth_user: AuthenticatedUser,
	invite_id: UUID,
	*,
	expected_role: str,
	new_status: InvitationStatus,
) -> InviteSummary:
	pool = await get_pool()
	async with pool.acquire() as conn:
		invite = await _load_invitation(conn, invite_id)
		user_id = str(auth_user.id)
		if expected_role == "recipient" and str(invite["to_user_id"]) != user_id:
			raise InviteForbidden("not_recipient")
		if expected_role == "sender" and str(invite["from_user_id"]) != user_id:
			raise InviteForbidden("not_sender")
		if invite["status"] != "sent":
			raise InviteGone("not_pending")
		if invite["expires_at"] <= datetime.now(timezone.utc):
			raise InviteGone("expired")

		updated = await conn.fetchrow(
			"""
			UPDATE invitations
			SET status = $2, updated_at = NOW()
			WHERE id = $1
			RETURNING *
			""",
			invite_id,
			new_status.value,
		)
		# Summarize while the connection is still held to avoid using a released connection
		summary = await _summarize_invite(conn, updated["id"])
	await audit.log_invite_event(
		new_status.value,
		{
			"invite_id": str(summary.id),
			"from": str(summary.from_user_id),
			"to": str(summary.to_user_id),
			"status": summary.status,
		},
	)
	await _emit_invite_update(summary)
	return summary


async def decline_invite(auth_user: AuthenticatedUser, invite_id: UUID) -> InviteSummary:
	return await _update_invite_status(
		auth_user,
		invite_id,
		expected_role="recipient",
		new_status=InvitationStatus.DECLINED,
	)


async def cancel_invite(auth_user: AuthenticatedUser, invite_id: UUID) -> InviteSummary:
	return await _update_invite_status(
		auth_user,
		invite_id,
		expected_role="sender",
		new_status=InvitationStatus.CANCELLED,
	)


async def list_inbox(auth_user: AuthenticatedUser) -> List[InviteSummary]:
	pool = await get_pool()
	async with pool.acquire() as conn:
		rows = await conn.fetch(
			"""
			SELECT i.*,
				sender.handle AS from_handle,
				COALESCE(sender.display_name, sender.handle) AS from_display_name,
				recipient.handle AS to_handle,
				COALESCE(recipient.display_name, recipient.handle) AS to_display_name
			FROM invitations i
			JOIN users sender ON sender.id = i.from_user_id
			JOIN users recipient ON recipient.id = i.to_user_id
			WHERE i.to_user_id = $1 AND i.status = 'sent'
			ORDER BY i.created_at DESC
			""",
			str(auth_user.id),
		)
	return [_record_to_summary(row) for row in rows]


async def list_outbox(auth_user: AuthenticatedUser) -> List[InviteSummary]:
	pool = await get_pool()
	async with pool.acquire() as conn:
		rows = await conn.fetch(
			"""
			SELECT i.*,
				sender.handle AS from_handle,
				COALESCE(sender.display_name, sender.handle) AS from_display_name,
				recipient.handle AS to_handle,
				COALESCE(recipient.display_name, recipient.handle) AS to_display_name
			FROM invitations i
			JOIN users sender ON sender.id = i.from_user_id
			JOIN users recipient ON recipient.id = i.to_user_id
			WHERE i.from_user_id = $1 AND i.status = 'sent'
			ORDER BY i.created_at DESC
			""",
			str(auth_user.id),
		)
	return [_record_to_summary(row) for row in rows]


async def list_inbox_paginated(
	auth_user: AuthenticatedUser,
	*,
	cursor: Optional[Tuple[datetime, str]] = None,
	limit: int = 50,
) -> tuple[List[InviteSummary], Optional[datetime], Optional[str]]:
	"""Keyset paginate inbox (to_user_id, status='sent'), ordered by created_at DESC, id DESC."""
	user_id = str(auth_user.id)
	pool = await get_pool()
	async with pool.acquire() as conn:
		params: list[object] = [user_id]
		where_cursor = ""
		if cursor:
			dt, last_id = cursor
			params.extend([dt, str(last_id)])
			where_cursor = " AND (created_at, id) < ($2, $3)"
		query = (
			"SELECT i.*, "
			" sender.handle AS from_handle, COALESCE(sender.display_name, sender.handle) AS from_display_name,"
			" recipient.handle AS to_handle, COALESCE(recipient.display_name, recipient.handle) AS to_display_name"
			" FROM invitations i"
			" JOIN users sender ON sender.id = i.from_user_id"
			" JOIN users recipient ON recipient.id = i.to_user_id"
			" WHERE i.to_user_id = $1 AND i.status = 'sent' AND i.deleted_at IS NULL"
			f"{where_cursor}"
			" ORDER BY i.created_at DESC, i.id DESC"
			" LIMIT $" + str(len(params) + 1)
		)
		params.append(limit + 1)
		rows = await conn.fetch(query, *params)
	items = [_record_to_summary(row) for row in rows[:limit]]
	next_dt: Optional[datetime] = None
	next_id: Optional[str] = None
	if len(rows) > limit:
		tail = rows[limit]
		next_dt = tail["created_at"]
		next_id = str(tail["id"])
	return items, next_dt, next_id


async def list_outbox_paginated(
	auth_user: AuthenticatedUser,
	*,
	cursor: Optional[Tuple[datetime, str]] = None,
	limit: int = 50,
) -> tuple[List[InviteSummary], Optional[datetime], Optional[str]]:
	"""Keyset paginate outbox (from_user_id, status='sent'), ordered by created_at DESC, id DESC."""
	user_id = str(auth_user.id)
	pool = await get_pool()
	async with pool.acquire() as conn:
		params: list[object] = [user_id]
		where_cursor = ""
		if cursor:
			dt, last_id = cursor
			params.extend([dt, str(last_id)])
			where_cursor = " AND (created_at, id) < ($2, $3)"
		query = (
			"SELECT i.*, "
			" sender.handle AS from_handle, COALESCE(sender.display_name, sender.handle) AS from_display_name,"
			" recipient.handle AS to_handle, COALESCE(recipient.display_name, recipient.handle) AS to_display_name"
			" FROM invitations i"
			" JOIN users sender ON sender.id = i.from_user_id"
			" JOIN users recipient ON recipient.id = i.to_user_id"
			" WHERE i.from_user_id = $1 AND i.status = 'sent' AND i.deleted_at IS NULL"
			f"{where_cursor}"
			" ORDER BY i.created_at DESC, i.id DESC"
			" LIMIT $" + str(len(params) + 1)
		)
		params.append(limit + 1)
		rows = await conn.fetch(query, *params)
	items = [_record_to_summary(row) for row in rows[:limit]]
	next_dt: Optional[datetime] = None
	next_id: Optional[str] = None
	if len(rows) > limit:
		tail = rows[limit]
		next_dt = tail["created_at"]
		next_id = str(tail["id"])
	return items, next_dt, next_id


# Cache TTL for friends list (30 seconds - short enough to stay fresh, long enough to help)
_FRIENDS_CACHE_TTL = 30


def _friends_cache_key(user_id: str, status: str) -> str:
	"""Generate cache key for friends list."""
	return f"friends:list:{user_id}:{status}"


async def _invalidate_friends_cache(user_id: str) -> None:
	"""Invalidate all friends list caches for a user."""
	from app.infra.redis import redis_client
	for status in ("accepted", "blocked", "pending"):
		key = _friends_cache_key(user_id, status)
		await redis_client.delete(key)


async def list_friends(auth_user: AuthenticatedUser, status_filter: str) -> List[FriendRow]:
	import json
	from app.infra.redis import redis_client
	
	allowed = {"accepted", "blocked", "pending"}
	if status_filter not in allowed:
		status_filter = "accepted"
	
	user_id = str(auth_user.id)
	cache_key = _friends_cache_key(user_id, status_filter)
	
	# Try cache first
	cached = await redis_client.get(cache_key)
	if cached:
		try:
			data = json.loads(cached)
			return [FriendRow(**item) for item in data]
		except (json.JSONDecodeError, TypeError):
			pass  # Cache miss or invalid data
	
	# Query database
	pool = await get_pool()
	async with pool.acquire() as conn:
		rows = await conn.fetch(
			"""
			SELECT f.*, u.handle AS friend_handle, COALESCE(u.display_name, u.handle) AS friend_display_name
			FROM friendships f
			JOIN users u ON u.id = f.friend_id
			WHERE f.user_id = $1 AND f.status = $2
			ORDER BY f.created_at DESC
			""",
			user_id,
			status_filter,
		)
	
	result = [_record_to_friend_row(row) for row in rows]
	
	# Cache the result
	try:
		cache_data = json.dumps([r.model_dump(mode="json") for r in result])
		await redis_client.setex(cache_key, _FRIENDS_CACHE_TTL, cache_data)
	except Exception:
		pass  # Non-critical - don't fail request if cache write fails
	
	return result


async def block_user(auth_user: AuthenticatedUser, target_user_id: UUID) -> FriendRow:
	blocker_id = str(auth_user.id)
	target_id = str(target_user_id)
	await policy.enforce_block_limits(blocker_id)
	pool = await get_pool()
	async with pool.acquire() as conn:
		await policy.assert_can_block(conn, blocker_id, target_id)
		async with conn.transaction():
			await conn.execute(
				"""
				INSERT INTO friendships (user_id, friend_id, status)
				VALUES ($1, $2, 'blocked')
				ON CONFLICT (user_id, friend_id)
				DO UPDATE SET status='blocked', updated_at = NOW()
				""",
				blocker_id,
				target_id,
			)
			await policy.cancel_other_open_between_pair(conn, blocker_id, target_id, exclude=[])
			row = await conn.fetchrow(
				"""
				SELECT f.*, u.handle AS friend_handle, COALESCE(u.display_name, u.handle) AS friend_display_name
				FROM friendships f
				JOIN users u ON u.id = f.friend_id
				WHERE f.user_id = $1 AND f.friend_id = $2
				""",
				blocker_id,
				target_id,
			)
	audit.inc_block("block")
	await audit.log_friend_event(
		"blocked",
		{"user_id": blocker_id, "friend_id": target_id, "status": "blocked"},
	)
	await _emit_friend_update_pair(blocker_id, target_id, "blocked")
	# Invalidate friends cache for both users
	await _invalidate_friends_cache(blocker_id)
	await _invalidate_friends_cache(target_id)
	return _record_to_friend_row(row)


async def unblock_user(auth_user: AuthenticatedUser, target_user_id: UUID) -> None:
	blocker_id = str(auth_user.id)
	target_id = str(target_user_id)
	pool = await get_pool()
	async with pool.acquire() as conn:
		await policy.ensure_users_exist_conn(conn, blocker_id, target_id)
		await policy.delete_friendship(conn, blocker_id, target_id)
	audit.inc_block("unblock")
	await audit.log_friend_event(
		"unblocked",
		{"user_id": blocker_id, "friend_id": target_id, "status": "none"},
	)
	await _emit_friend_update_pair(blocker_id, target_id, "none")
	# Invalidate friends cache for both users
	await _invalidate_friends_cache(blocker_id)
	await _invalidate_friends_cache(target_id)


async def remove_friend(auth_user: AuthenticatedUser, target_user_id: UUID) -> None:
	user_id = str(auth_user.id)
	target_id = str(target_user_id)
	pool = await get_pool()
	async with pool.acquire() as conn:
		await policy.ensure_users_exist_conn(conn, user_id, target_id)
		async with conn.transaction():
			await policy.delete_friendship(conn, user_id, target_id)
			await policy.delete_friendship(conn, target_id, user_id)
	await audit.log_friend_event(
		"removed",
		{"user_id": user_id, "friend_id": target_id, "status": "none"},
	)
	await _emit_friend_update_pair(user_id, target_id, "none")
	# Invalidate friends cache for both users
	await _invalidate_friends_cache(user_id)
	await _invalidate_friends_cache(target_id)

