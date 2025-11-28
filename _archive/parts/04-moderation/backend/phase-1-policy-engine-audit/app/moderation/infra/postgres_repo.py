"""PostgreSQL-backed repository for moderation models."""

from __future__ import annotations

from datetime import datetime
from typing import Mapping, Optional

import asyncpg

from app.moderation.domain.enforcement import (
	AuditLogEntry,
	ModerationAction,
	ModerationCase,
	ModerationRepository,
)


class PostgresModerationRepository(ModerationRepository):
	"""Persists moderation mutations using asyncpg."""

	def __init__(self, pool: asyncpg.Pool) -> None:
		self.pool = pool

	async def upsert_case(
		self,
		subject_type: str,
		subject_id: str,
		reason: str,
		severity: int,
		policy_id: Optional[str],
		created_by: Optional[str],
	) -> ModerationCase:
		query = """
		INSERT INTO mod_case (subject_type, subject_id, status, reason, policy_id, severity, created_by)
		VALUES ($1, $2, 'open', $3, $4, $5, $6)
		ON CONFLICT (subject_type, subject_id)
		DO UPDATE SET
			reason = EXCLUDED.reason,
			policy_id = EXCLUDED.policy_id,
			severity = EXCLUDED.severity,
			updated_at = now()
		RETURNING id, subject_type, subject_id, status, reason, severity, policy_id, created_by, created_at, updated_at
		"""
		record = await self.pool.fetchrow(query, subject_type, subject_id, reason, policy_id, severity, created_by)
		assert record is not None
		return _case_from_record(record)

	async def record_action(
		self,
		case_id: str,
		action: str,
		payload: Mapping[str, object],
		actor_id: Optional[str],
	) -> ModerationAction:
		query = """
		INSERT INTO mod_action(case_id, action, payload, actor_id)
		VALUES ($1, $2, $3::jsonb, $4)
		RETURNING case_id, action, payload, actor_id, created_at
		"""
		record = await self.pool.fetchrow(query, case_id, action, dict(payload), actor_id)
		assert record is not None
		return _action_from_record(record)

	async def already_applied(self, case_id: str, action: str) -> bool:
		query = "SELECT 1 FROM mod_action WHERE case_id = $1 AND action = $2 LIMIT 1"
		row = await self.pool.fetchrow(query, case_id, action)
		return row is not None

	async def update_case_status(self, case_id: str, status: str) -> None:
		query = "UPDATE mod_case SET status = $2, updated_at = now() WHERE id = $1"
		await self.pool.execute(query, case_id, status)

	async def audit(
		self,
		actor_id: Optional[str],
		action: str,
		target_type: str,
		target_id: str,
		meta: Mapping[str, object],
	) -> AuditLogEntry:
		query = """
		INSERT INTO mod_audit(actor_id, action, target_type, target_id, meta)
		VALUES ($1, $2, $3, $4, $5::jsonb)
		RETURNING actor_id, action, target_type, target_id, meta, created_at
		"""
		record = await self.pool.fetchrow(query, actor_id, action, target_type, target_id, dict(meta))
		assert record is not None
		return _audit_from_record(record)

	async def get_case(self, case_id: str) -> ModerationCase | None:
		query = """
		SELECT id, subject_type, subject_id, status, reason, severity, policy_id, created_by, created_at, updated_at
		FROM mod_case
		WHERE id = $1
		"""
		record = await self.pool.fetchrow(query, case_id)
		if record is None:
			return None
		return _case_from_record(record)

	async def list_actions(self, case_id: str) -> list[ModerationAction]:
		query = """
		SELECT case_id, action, payload, actor_id, created_at
		FROM mod_action
		WHERE case_id = $1
		ORDER BY created_at ASC
		"""
		records = await self.pool.fetch(query, case_id)
		return [_action_from_record(record) for record in records]

	async def list_audit(self, *, after: datetime | None, limit: int) -> list[AuditLogEntry]:
		if after:
			query = """
			SELECT actor_id, action, target_type, target_id, meta, created_at
			FROM mod_audit
			WHERE created_at > $1
			ORDER BY created_at DESC
			LIMIT $2
			"""
			records = await self.pool.fetch(query, after, limit)
		else:
			query = """
			SELECT actor_id, action, target_type, target_id, meta, created_at
			FROM mod_audit
			ORDER BY created_at DESC
			LIMIT $1
			"""
			records = await self.pool.fetch(query, limit)
		return [_audit_from_record(record) for record in records]


def _case_from_record(record: asyncpg.Record) -> ModerationCase:
	return ModerationCase(
		case_id=str(record["id"]),
		subject_type=str(record["subject_type"]),
		subject_id=str(record["subject_id"]),
		status=str(record["status"]),
		reason=str(record["reason"]),
		severity=int(record["severity"]),
		policy_id=str(record["policy_id"]) if record["policy_id"] is not None else None,
		created_at=record["created_at"],
		updated_at=record["updated_at"],
		created_by=str(record["created_by"]) if record["created_by"] is not None else None,
	)


def _action_from_record(record: asyncpg.Record) -> ModerationAction:
	payload = record["payload"]
	if isinstance(payload, str):
		# asyncpg may return jsonb as str if type codec missing; fall back to empty dict.
		payload_dict: Mapping[str, object] = {}
	else:
		payload_dict = dict(payload)
	return ModerationAction(
		case_id=str(record["case_id"]),
		action=str(record["action"]),
		payload=payload_dict,
		actor_id=str(record["actor_id"]) if record["actor_id"] is not None else None,
		created_at=record["created_at"],
	)


def _audit_from_record(record: asyncpg.Record) -> AuditLogEntry:
	meta = record["meta"]
	meta_dict: Mapping[str, object] = dict(meta) if not isinstance(meta, str) else {}
	return AuditLogEntry(
		actor_id=str(record["actor_id"]) if record["actor_id"] is not None else None,
		action=str(record["action"]),
		target_type=str(record["target_type"]),
		target_id=str(record["target_id"]),
		meta=meta_dict,
		created_at=record["created_at"],
	)
