"""Audit helpers for identity security events."""

from __future__ import annotations

from datetime import datetime, timezone
from typing import Any, Dict, Iterable, Optional

from app.domain.identity import models, policy
from app.infra.postgres import get_pool
from app.infra.redis import redis_client
from app.obs import metrics as obs_metrics

STREAM_KEY = "x:identity.events"


def _now_iso() -> str:
	return datetime.now(timezone.utc).isoformat()


def _stringify(meta: Dict[str, Any]) -> Dict[str, str]:
	return {key: ("" if value is None else str(value)) for key, value in meta.items()}


async def log_event(event: str, *, user_id: Optional[str] = None, meta: Optional[Dict[str, Any]] = None) -> None:
	payload: Dict[str, Any] = {"event": event, "ts": _now_iso()}
	if user_id:
		payload["user_id"] = user_id
	if meta:
		payload.update(_stringify(meta))
	await redis_client.xadd(STREAM_KEY, payload)


def inc_session_created() -> None:
	obs_metrics.inc_identity_session_created()


def inc_session_revoked() -> None:
	obs_metrics.inc_identity_session_revoked()


def inc_twofa_enroll() -> None:
	obs_metrics.inc_identity_twofa_enroll()


def inc_twofa_enable() -> None:
	obs_metrics.inc_identity_twofa_enable()


def inc_twofa_verify(result: str) -> None:
	obs_metrics.inc_identity_twofa_verify(result)


def inc_pwreset_request() -> None:
	obs_metrics.inc_identity_pwreset_request()


def inc_pwreset_consume(result: str) -> None:
	obs_metrics.inc_identity_pwreset_consume(result)


async def append_db_event(user_id: str, event: str, meta: Optional[Dict[str, Any]] = None) -> None:
	"""Persist an audit entry to the database."""
	pool = await get_pool()
	async with pool.acquire() as conn:
		await conn.execute(
			"""
			INSERT INTO audit_log (user_id, event, meta)
			VALUES ($1, $2, $3)
			""",
			user_id,
			event,
			meta or {},
		)


async def fetch_audit_log(
	user_id: str,
	*,
	limit: int = 50,
	cursor: Optional[int] = None,
) -> tuple[list[models.AuditLogEntry], Optional[int]]:
	"""Fetch audit log entries for a user with optional pagination."""
	page = max(1, min(limit, policy.AUDIT_PAGE_MAX))
	query = (
		"""
		SELECT id, user_id, event, meta, created_at
		FROM audit_log
		WHERE user_id = $1
			AND ($2::bigint IS NULL OR id < $2)
		ORDER BY id DESC
		LIMIT $3
		"""
	)
	pool = await get_pool()
	async with pool.acquire() as conn:
		rows = await conn.fetch(query, user_id, cursor, page)
	entries = [models.AuditLogEntry.from_record(row) for row in rows]
	next_cursor: Optional[int] = None
	if len(entries) == page:
		next_cursor = entries[-1].id
	return entries, next_cursor


async def bulk_append_db_events(events: Iterable[tuple[str, str, Dict[str, Any]]]) -> None:
	"""Utility for batch inserting audit events (used in tests/workers)."""
	pool = await get_pool()
	async with pool.acquire() as conn:
		async with conn.transaction():
			for user_id, event, meta in events:
				await conn.execute(
					"""
					INSERT INTO audit_log (user_id, event, meta)
					VALUES ($1, $2, $3)
					""",
					user_id,
					event,
					meta,
				)
