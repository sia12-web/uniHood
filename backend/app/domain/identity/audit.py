"""Audit helpers for identity security events."""

from __future__ import annotations

import json
import logging
from datetime import datetime, timezone
from typing import Any, Dict, Optional

from app.domain.identity import models, policy
from app.infra.postgres import get_pool
from app.infra.redis import redis_client
from app.obs import metrics as obs_metrics

STREAM_KEY = "x:identity.events"
logger = logging.getLogger(__name__)


def _now_iso() -> str:
	return datetime.now(timezone.utc).isoformat()


def _stringify(meta: Dict[str, Any]) -> Dict[str, str]:
	return {key: ("" if value is None else str(value)) for key, value in meta.items()}


async def log_event(
	event: str,
	*,
	user_id: Optional[str] = None,
	ip: Optional[str] = None,
	user_agent: Optional[str] = None,
	meta: Optional[Dict[str, Any]] = None,
) -> None:
	"""Log an identity/security event.
	
	Writes to both Redis Stream (for real-time workers) and Postgres `audit_logs` (immutable record).
	"""
	# 1. Stream Payload
	payload: Dict[str, Any] = {"event": event, "ts": _now_iso()}
	if user_id:
		payload["user_id"] = user_id
	if ip:
		payload["ip"] = ip
	if user_agent:
		payload["ua"] = user_agent
	if meta:
		payload.update(_stringify(meta))
	
	try:
		await redis_client.xadd(STREAM_KEY, payload)
	except Exception:
		logger.warning("failed to append identity audit stream event", exc_info=True)

	# 2. Immutable DB Record (Phase 6 Hardening)
	try:
		pool = await get_pool()
		async with pool.acquire() as conn:
			await conn.execute(
				"""
				INSERT INTO audit_logs (user_id, event, ip_address, user_agent, meta)
				VALUES ($1, $2, $3, $4, $5)
				""",
				user_id if user_id else None,
				event,
				ip,
				user_agent,
				json.dumps(meta or {}),
			)
	except Exception:
		# Audit logging failure is CRITICAL in some regimes, but for MVP we shouldn't crash auth flow.
		# Ideally, we'd have a fallback file logger.
		logger.error("failed to persist audit log to DB", exc_info=True)


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


async def fetch_audit_log(
	user_id: str,
	*,
	limit: int = 50,
	cursor: Optional[int] = None,
) -> tuple[list[models.AuditLogEntry], Optional[int]]:
	"""Fetch audit log entries for a user with optional pagination.
	
	Admins/Users viewing their own history. Uses the new `audit_logs` table.
	"""
	page = max(1, min(limit, policy.AUDIT_PAGE_MAX))
	query = (
		"""
		SELECT id, user_id, event, meta, created_at
		FROM audit_logs
		WHERE user_id = $1::uuid
			AND ($2::integer IS NULL OR id < $2)
		ORDER BY id DESC
		LIMIT $3
		"""
	)
	pool = await get_pool()
	async with pool.acquire() as conn:
		rows = await conn.fetch(query, user_id, cursor, page)
	
	# Mapping legacy model to new schema (ignoring ip/ua for now in the model response if not present)
	entries = []
	for row in rows:
		# Map row to AuditLogEntry. 
		# Models might need update if we want to show IP/UA to user.
		entry = models.AuditLogEntry(
			id=row["id"],
			user_id=row["user_id"],
			event=row["event"],
			meta=json.loads(row["meta"]) if isinstance(row["meta"], str) else row["meta"],
			created_at=row["created_at"],
		)
		entries.append(entry)

	next_cursor: Optional[int] = None
	if len(entries) == page:
		next_cursor = entries[-1].id
	return entries, next_cursor
