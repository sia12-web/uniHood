"""Policy helpers and guard checks for social invites & friendships."""

from __future__ import annotations

from datetime import datetime, timezone
from typing import Iterable, Optional

import asyncpg

from app.domain.social.exceptions import (
	BlockLimitExceeded,
	InviteAlreadyFriends,
	InviteAlreadySent,
	InviteBlocked,
	InviteForbidden,
	InviteNotFound,
	InviteRateLimitExceeded,
	InviteSelfError,
)
from app.domain.social.models import BLOCK_PER_MINUTE, INVITE_PER_DAY, INVITE_PER_MINUTE
from app.infra.postgres import get_pool
from app.infra.redis import redis_client


async def _touch_limit(key: str, ttl_seconds: int) -> int:
	async with redis_client.pipeline(transaction=True) as pipe:
		pipe.incr(key)
		pipe.expire(key, ttl_seconds)
		count, _ = await pipe.execute()
	return int(count)


async def enforce_invite_limits(user_id: str) -> None:
	now = datetime.now(timezone.utc)
	per_min_bucket = now.strftime("%Y%m%d%H%M")
	per_min_key = f"rl:invite:send:{user_id}:{per_min_bucket}"
	if await _touch_limit(per_min_key, 60) > INVITE_PER_MINUTE:
		raise InviteRateLimitExceeded("per_minute")

	per_day_bucket = now.strftime("%Y%m%d")
	per_day_key = f"rl:invite:daily:{user_id}:{per_day_bucket}"
	if await _touch_limit(per_day_key, 86_400) > INVITE_PER_DAY:
		raise InviteRateLimitExceeded("per_day")


async def enforce_block_limits(user_id: str) -> None:
	now = datetime.now(timezone.utc)
	per_min_bucket = now.strftime("%Y%m%d%H%M")
	key = f"rl:block:{user_id}:{per_min_bucket}"
	if await _touch_limit(key, 60) > BLOCK_PER_MINUTE:
		raise BlockLimitExceeded("per_minute")


def guard_not_self(user_id: str, target_id: str) -> None:
	if str(user_id) == str(target_id):
		raise InviteSelfError()


async def ensure_users_exist(*user_ids: str) -> None:
	pool = await get_pool()
	async with pool.acquire() as conn:
		await _ensure_users_exist_conn(conn, user_ids)


async def ensure_users_exist_conn(conn: asyncpg.Connection, *user_ids: str) -> None:
	await _ensure_users_exist_conn(conn, user_ids)


async def _ensure_users_exist_conn(conn: asyncpg.Connection, user_ids: Iterable[str]) -> None:
	unique_ids = list({str(uid) for uid in user_ids})
	if not unique_ids:
		raise InviteNotFound("no_users")
	rows = await conn.fetch("SELECT id FROM users WHERE id = ANY($1::uuid[]) AND deleted_at IS NULL", unique_ids)
	found = {str(row["id"]) for row in rows}
	if len(found) != len(unique_ids):
		raise InviteNotFound("user_missing")


async def is_blocked_either_way(conn: asyncpg.Connection, user_a: str, user_b: str) -> bool:
	rows = await conn.fetch(
		"""
		SELECT status FROM friendships
		WHERE (user_id = $1 AND friend_id = $2)
		   OR (user_id = $2 AND friend_id = $1)
		LIMIT 2
		""",
		user_a,
		user_b,
	)
	return any(row["status"] == "blocked" for row in rows)


async def ensure_not_blocked(conn: asyncpg.Connection, user_a: str, user_b: str) -> None:
	if await is_blocked_either_way(conn, user_a, user_b):
		raise InviteBlocked()


async def are_friends(conn: asyncpg.Connection, user_a: str, user_b: str) -> bool:
	rows = await conn.fetch(
		"""
		SELECT COUNT(*) AS cnt
		FROM friendships
		WHERE user_id = ANY($1::uuid[])
		  AND friend_id = ANY($1::uuid[])
		  AND status = 'accepted'
		""",
		[user_a, user_b],
	)
	return rows[0]["cnt"] >= 2


async def ensure_not_already_friends(conn: asyncpg.Connection, user_a: str, user_b: str) -> None:
	if await are_friends(conn, user_a, user_b):
		raise InviteAlreadyFriends()


async def get_open_invite(
	conn: asyncpg.Connection,
	from_user_id: str,
	to_user_id: str,
) -> Optional[asyncpg.Record]:
	record = await conn.fetchrow(
		"""
		SELECT *
		FROM invitations
		WHERE from_user_id = $1
		  AND to_user_id = $2
		  AND status = 'sent'
		  AND expires_at > NOW()
		ORDER BY created_at DESC
		LIMIT 1
		""",
		from_user_id,
		to_user_id,
	)
	return record


async def ensure_no_open_invite(
	conn: asyncpg.Connection,
	from_user_id: str,
	to_user_id: str,
) -> None:
	record = await get_open_invite(conn, from_user_id, to_user_id)
	if record:
		raise InviteAlreadySent()


async def cancel_other_open_between_pair(
	conn: asyncpg.Connection,
	user_a: str,
	user_b: str,
	exclude_ids: Optional[list[str]] = None,
) -> None:
	exclude_ids = exclude_ids or []
	await conn.execute(
		"""
		UPDATE invitations
		SET status = 'cancelled', updated_at = NOW()
		WHERE status = 'sent'
		  AND expires_at > NOW()
		  AND ((from_user_id = $1 AND to_user_id = $2) OR (from_user_id = $2 AND to_user_id = $1))
		  AND NOT (id = ANY($3::uuid[]))
		""",
		user_a,
		user_b,
		exclude_ids,
	)


async def upsert_friendships_bidirectional(
	conn: asyncpg.Connection,
	user_a: str,
	user_b: str,
	*,
	status: str = "accepted",
) -> None:
	await conn.executemany(
		"""
		INSERT INTO friendships (user_id, friend_id, status)
		VALUES ($1, $2, $3)
		ON CONFLICT (user_id, friend_id)
		DO UPDATE SET status = EXCLUDED.status, updated_at = NOW()
		""",
		[
			(user_a, user_b, status),
			(user_b, user_a, status),
		],
	)


async def delete_friendship(conn: asyncpg.Connection, user_id: str, friend_id: str) -> None:
	await conn.execute(
		"DELETE FROM friendships WHERE user_id = $1 AND friend_id = $2",
		user_id,
		friend_id,
	)


async def ensure_user_exists(conn: asyncpg.Connection, user_id: str) -> None:
	row = await conn.fetchrow("SELECT 1 FROM users WHERE id = $1 AND deleted_at IS NULL", user_id)
	if not row:
		raise InviteNotFound("user_missing")


async def assert_can_block(conn: asyncpg.Connection, blocker_id: str, target_id: str) -> None:
	await _ensure_users_exist_conn(conn, [blocker_id, target_id])
	if str(blocker_id) == str(target_id):
		raise InviteForbidden("self_block")
