"""Privacy settings and blocklist helpers."""

from __future__ import annotations

from datetime import datetime, timezone
from typing import Any, Optional
from uuid import UUID

import asyncpg

from app.domain.identity import audit, policy, schemas
from app.infra.auth import AuthenticatedUser
from app.infra.postgres import get_pool
from app.obs import metrics as obs_metrics


DEFAULT_PRIVACY = schemas.PrivacySettings().model_dump()


def _now() -> datetime:
	return datetime.now(timezone.utc)


def _coerce_privacy(value: Optional[dict[str, Any]]) -> dict[str, Any]:
	merged = dict(DEFAULT_PRIVACY)
	if value:
		merged.update({k: v for k, v in value.items() if k in DEFAULT_PRIVACY})
	return merged


async def get_privacy_settings(user_id: str) -> schemas.PrivacySettings:
	pool = await get_pool()
	async with pool.acquire() as conn:
		row = await conn.fetchrow("SELECT privacy FROM users WHERE id = $1", user_id)
	if not row:
		raise policy.IdentityPolicyError("user_missing")
	return schemas.PrivacySettings(**_coerce_privacy(row.get("privacy")))


async def update_privacy_settings(
	auth_user: AuthenticatedUser,
	payload: schemas.PrivacySettingsPatch,
) -> schemas.PrivacySettings:
	updates = payload.model_dump(exclude_none=True)
	if not updates:
		return await get_privacy_settings(auth_user.id)
	await policy.enforce_privacy_update_rate(auth_user.id)
	pools = await get_pool()
	async with pools.acquire() as conn:
		async with conn.transaction():
			row = await conn.fetchrow(
				"SELECT privacy FROM users WHERE id = $1 FOR UPDATE",
				auth_user.id,
			)
			if not row:
				raise policy.IdentityPolicyError("user_missing")
			merged = _coerce_privacy(row.get("privacy"))
			merged.update(updates)
			await conn.execute(
				"""
				UPDATE users
				SET privacy = $1,
					updated_at = NOW()
				WHERE id = $2
				""",
				merged,
				auth_user.id,
			)
	privacy = schemas.PrivacySettings(**merged)
	fields_meta = ",".join(sorted(updates.keys())) or "none"
	obs_metrics.inc_identity_privacy_update()
	await audit.log_event(
		"privacy_change",
		user_id=auth_user.id,
		meta={"fields": fields_meta},
	)
	return privacy


async def list_blocks(user_id: str) -> list[schemas.BlockListEntry]:
	pool = await get_pool()
	async with pool.acquire() as conn:
		rows = await conn.fetch(
			"""
			SELECT b.blocked_id, b.created_at, u.handle, u.display_name
			FROM blocks b
			LEFT JOIN users u ON u.id = b.blocked_id
			WHERE b.user_id = $1
			ORDER BY b.created_at DESC
			""",
			user_id,
		)
	items: list[schemas.BlockListEntry] = []
	for row in rows:
		items.append(
			schemas.BlockListEntry(
				blocked_id=row["blocked_id"],
				blocked_handle=row.get("handle"),
				blocked_display_name=row.get("display_name"),
				created_at=row["created_at"],
			)
		)
	return items


async def _ensure_user_exists(conn: asyncpg.Connection, user_id: str) -> None:
	user_exists = await conn.fetchval("SELECT 1 FROM users WHERE id = $1", user_id)
	if not user_exists:
		raise policy.IdentityPolicyError("user_missing")


async def block_user(auth_user: AuthenticatedUser, blocked_id: str) -> schemas.BlockListEntry:
	if blocked_id == auth_user.id:
		raise policy.IdentityPolicyError("block_self")
	pool = await get_pool()
	async with pool.acquire() as conn:
		async with conn.transaction():
			await _ensure_user_exists(conn, blocked_id)
			result = await conn.execute(
				"""
				INSERT INTO blocks (user_id, blocked_id)
				VALUES ($1, $2)
				ON CONFLICT DO NOTHING
				""",
				auth_user.id,
				blocked_id,
			)
			if result.endswith("0"):
				raise policy.IdentityPolicyError("block_exists")
			await conn.execute(
				"""
				DELETE FROM friendships
				WHERE (user_id = $1 AND friend_id = $2)
					OR (user_id = $2 AND friend_id = $1)
				""",
				auth_user.id,
				blocked_id,
			)
			await conn.execute(
				"""
				UPDATE invitations
				SET status = 'cancelled', updated_at = NOW()
				WHERE status = 'sent'
					AND ((from_user_id = $1 AND to_user_id = $2) OR (from_user_id = $2 AND to_user_id = $1))
				""",
				auth_user.id,
				blocked_id,
			)
			user_row = await conn.fetchrow(
				"SELECT handle, display_name FROM users WHERE id = $1",
				blocked_id,
			)
			block_row = await conn.fetchrow(
				"""
				SELECT created_at
				FROM blocks
				WHERE user_id = $1 AND blocked_id = $2
				""",
				auth_user.id,
				blocked_id,
			)
	created_at = block_row["created_at"] if block_row else _now()
	blocked_entry = schemas.BlockListEntry(
		blocked_id=UUID(str(blocked_id)),
		blocked_handle=user_row.get("handle") if user_row else None,
		blocked_display_name=user_row.get("display_name") if user_row else None,
		created_at=created_at,
	)
	obs_metrics.inc_identity_block("block")
	await audit.log_event("block", user_id=auth_user.id, meta={"target": str(blocked_id)})
	return blocked_entry


async def unblock_user(auth_user: AuthenticatedUser, blocked_id: str) -> None:
	pool = await get_pool()
	async with pool.acquire() as conn:
		result = await conn.execute(
			"""
			DELETE FROM blocks
			WHERE user_id = $1 AND blocked_id = $2
			""",
			auth_user.id,
			blocked_id,
		)
	if result.endswith("0"):
		raise policy.IdentityPolicyError("block_missing")
	obs_metrics.inc_identity_block("unblock")
	await audit.log_event("unblock", user_id=auth_user.id, meta={"target": str(blocked_id)})
