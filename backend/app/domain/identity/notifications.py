"""Notification preferences CRUD helpers."""

from __future__ import annotations

from datetime import datetime, timezone
from typing import Any, Optional

from app.domain.identity import audit, schemas
from app.infra.postgres import get_pool

DEFAULT_PREFS = schemas.NotificationPreferences().model_dump()


def _now() -> datetime:
	return datetime.now(timezone.utc)


def _merge_prefs(existing: Optional[dict[str, Any]]) -> dict[str, Any]:
	merged = dict(DEFAULT_PREFS)
	if existing:
		merged.update({k: v for k, v in existing.items() if k in DEFAULT_PREFS})
	return merged


async def get_preferences(user_id: str) -> schemas.NotificationPreferences:
	pool = await get_pool()
	async with pool.acquire() as conn:
		row = await conn.fetchrow("SELECT prefs FROM notification_prefs WHERE user_id = $1", user_id)
	if not row:
		return schemas.NotificationPreferences(**DEFAULT_PREFS)
	return schemas.NotificationPreferences(**_merge_prefs(row.get("prefs")))


async def update_preferences(user_id: str, patch: schemas.NotificationPreferencesPatch) -> schemas.NotificationPreferences:
	updates = patch.model_dump(exclude_none=True)
	pool = await get_pool()
	async with pool.acquire() as conn:
		async with conn.transaction():
			row = await conn.fetchrow("SELECT prefs FROM notification_prefs WHERE user_id = $1 FOR UPDATE", user_id)
			merged = _merge_prefs(row.get("prefs") if row else {})
			if updates:
				merged.update(updates)
			await conn.execute(
				"""
				INSERT INTO notification_prefs (user_id, prefs, updated_at)
				VALUES ($1, $2, $3)
				ON CONFLICT (user_id)
				DO UPDATE SET prefs = EXCLUDED.prefs, updated_at = EXCLUDED.updated_at
				""",
				user_id,
				merged,
				_now(),
			)
	prefs = schemas.NotificationPreferences(**merged)
	if updates:
		fields_meta = ",".join(sorted(updates.keys())) or "none"
		await audit.append_db_event(user_id, "notifications_change", {"fields": fields_meta})
		await audit.log_event("notifications_change", user_id=user_id, meta={"fields": fields_meta})
	return prefs
