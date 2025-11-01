"""PostgreSQL-backed repository for moderation models."""

from __future__ import annotations

import json
from datetime import datetime
from typing import Mapping, Optional

import asyncpg

from app.moderation.domain.enforcement import (
    AuditLogEntry,
    ModerationAction,
    ModerationAppeal,
    ModerationCase,
    ModerationReport,
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
        RETURNING
            id,
            subject_type,
            subject_id,
            status,
            reason,
            severity,
            policy_id,
            created_by,
            created_at,
            updated_at,
            assigned_to,
            escalation_level,
            appeal_open,
            appealed_by,
            appeal_note
        """
        record = await self.pool.fetchrow(
            query,
            subject_type,
            subject_id,
            reason,
            policy_id,
            severity,
            created_by,
        )
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
        SELECT id, subject_type, subject_id, status, reason, severity, policy_id, created_by, created_at, updated_at,
               assigned_to, escalation_level, appeal_open, appealed_by, appeal_note
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

    async def list_cases(self, *, status: Optional[str], assigned_to: Optional[str]) -> list[ModerationCase]:
        conditions: list[str] = []
        params: list[object] = []
        if status:
            params.append(status)
            conditions.append(f"status = ${len(params)}")
        if assigned_to == "none":
            conditions.append("assigned_to IS NULL")
        elif assigned_to:
            params.append(assigned_to)
            conditions.append(f"assigned_to = ${len(params)}")
        where_clause = f"WHERE {' AND '.join(conditions)}" if conditions else ""
        query = f"""
            SELECT id, subject_type, subject_id, status, reason, severity, policy_id, created_by,
                   created_at, updated_at, assigned_to, escalation_level, appeal_open, appealed_by, appeal_note
            FROM mod_case
            {where_clause}
            ORDER BY updated_at DESC
        """
        records = await self.pool.fetch(query, *params)
        return [_case_from_record(record) for record in records]

    async def assign_case(self, case_id: str, moderator_id: str) -> ModerationCase:
        query = """
        UPDATE mod_case
        SET assigned_to = $2, updated_at = now()
        WHERE id = $1
        RETURNING id, subject_type, subject_id, status, reason, severity, policy_id, created_by,
                  created_at, updated_at, assigned_to, escalation_level, appeal_open, appealed_by, appeal_note
        """
        record = await self.pool.fetchrow(query, case_id, moderator_id)
        if record is None:
            raise KeyError(case_id)
        return _case_from_record(record)

    async def escalate_case(self, case_id: str) -> ModerationCase:
        query = """
        UPDATE mod_case
        SET escalation_level = escalation_level + 1,
            status = 'escalated',
            updated_at = now()
        WHERE id = $1
        RETURNING id, subject_type, subject_id, status, reason, severity, policy_id, created_by,
                  created_at, updated_at, assigned_to, escalation_level, appeal_open, appealed_by, appeal_note
        """
        record = await self.pool.fetchrow(query, case_id)
        if record is None:
            raise KeyError(case_id)
        return _case_from_record(record)

    async def dismiss_case(self, case_id: str) -> ModerationCase:
        query = """
        UPDATE mod_case
        SET status = 'dismissed',
            updated_at = now()
        WHERE id = $1
        RETURNING id, subject_type, subject_id, status, reason, severity, policy_id, created_by,
                  created_at, updated_at, assigned_to, escalation_level, appeal_open, appealed_by, appeal_note
        """
        record = await self.pool.fetchrow(query, case_id)
        if record is None:
            raise KeyError(case_id)
        return _case_from_record(record)

    async def create_report(
        self,
        case_id: str,
        reporter_id: str,
        reason_code: str,
        note: str | None,
    ) -> ModerationReport:
        query = """
        INSERT INTO mod_report(case_id, reporter_id, reason_code, note)
        VALUES ($1, $2, $3, $4)
        RETURNING id, case_id, reporter_id, reason_code, note, created_at
        """
        try:
            record = await self.pool.fetchrow(query, case_id, reporter_id, reason_code, note)
        except asyncpg.UniqueViolationError as exc:  # type: ignore[attr-defined]
            raise ValueError("report_duplicate") from exc
        if record is None:
            raise RuntimeError("failed to create report")
        return _report_from_record(record)

    async def report_exists(self, case_id: str, reporter_id: str) -> bool:
        query = "SELECT 1 FROM mod_report WHERE case_id = $1 AND reporter_id = $2 LIMIT 1"
        row = await self.pool.fetchrow(query, case_id, reporter_id)
        return row is not None

    async def count_active_reports(self, reporter_id: str) -> int:
        query = """
        SELECT COUNT(*)
        FROM mod_report r
        JOIN mod_case c ON r.case_id = c.id
        WHERE r.reporter_id = $1
          AND c.status IN ('open','escalated')
        """
        value = await self.pool.fetchval(query, reporter_id)
        return int(value or 0)

    async def list_reports_for_case(self, case_id: str) -> list[ModerationReport]:
        query = """
        SELECT id, case_id, reporter_id, reason_code, note, created_at
        FROM mod_report
        WHERE case_id = $1
        ORDER BY created_at ASC
        """
        records = await self.pool.fetch(query, case_id)
        return [_report_from_record(record) for record in records]

    async def create_appeal(self, case_id: str, appellant_id: str, note: str) -> ModerationAppeal:
        record: asyncpg.Record | None = None
        async with self.pool.acquire() as conn:
            async with conn.transaction():
                insert_query = """
                INSERT INTO mod_appeal(case_id, appellant_id, note, status)
                VALUES ($1, $2, $3, 'pending')
                RETURNING id, case_id, appellant_id, note, status, reviewed_by, created_at, reviewed_at
                """
                record = await conn.fetchrow(insert_query, case_id, appellant_id, note)
                if record is None:
                    raise RuntimeError("failed to create appeal")
                await conn.execute(
                    """
                    UPDATE mod_case
                    SET appeal_open = TRUE,
                        appealed_by = $2,
                        appeal_note = $3,
                        updated_at = now()
                    WHERE id = $1
                    """,
                    case_id,
                    appellant_id,
                    note,
                )
        assert record is not None
        return _appeal_from_record(record)

    async def get_appeal(self, appeal_id: str) -> ModerationAppeal | None:
        query = """
        SELECT id, case_id, appellant_id, note, status, reviewed_by, created_at, reviewed_at
        FROM mod_appeal
        WHERE id = $1
        """
        record = await self.pool.fetchrow(query, appeal_id)
        if record is None:
            return None
        return _appeal_from_record(record)

    async def resolve_appeal(
        self,
        appeal_id: str,
        reviewer_id: str,
        status: str,
        note: str | None,
    ) -> ModerationAppeal:
        record: asyncpg.Record | None = None
        async with self.pool.acquire() as conn:
            async with conn.transaction():
                update_query = """
                UPDATE mod_appeal
                SET status = $2,
                    reviewed_by = $3,
                    reviewed_at = now()
                WHERE id = $1
                RETURNING id, case_id, appellant_id, note, status, reviewed_by, created_at, reviewed_at
                """
                record = await conn.fetchrow(update_query, appeal_id, status, reviewer_id)
                if record is None:
                    raise KeyError(appeal_id)
                await conn.execute(
                    """
                    UPDATE mod_case
                    SET appeal_open = FALSE,
                        appealed_by = NULL,
                        appeal_note = COALESCE($2, appeal_note),
                        status = 'closed',
                        updated_at = now()
                    WHERE id = $1
                    """,
                    record["case_id"],
                    note,
                )
        assert record is not None
        return _appeal_from_record(record)

    async def set_case_closed(self, case_id: str) -> ModerationCase:
        query = """
        UPDATE mod_case
        SET status = 'closed', updated_at = now()
        WHERE id = $1
        RETURNING id, subject_type, subject_id, status, reason, severity, policy_id, created_by,
                  created_at, updated_at, assigned_to, escalation_level, appeal_open, appealed_by, appeal_note
        """
        record = await self.pool.fetchrow(query, case_id)
        if record is None:
            raise KeyError(case_id)
        return _case_from_record(record)


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
        assigned_to=str(record["assigned_to"]) if record["assigned_to"] is not None else None,
        escalation_level=int(record["escalation_level"]),
        appeal_open=bool(record["appeal_open"]),
        appealed_by=str(record["appealed_by"]) if record["appealed_by"] is not None else None,
        appeal_note=str(record["appeal_note"]) if record["appeal_note"] is not None else None,
    )


def _action_from_record(record: asyncpg.Record) -> ModerationAction:
    payload = record["payload"]
    if isinstance(payload, str):
        try:
            payload_dict: Mapping[str, object] = json.loads(payload)
        except json.JSONDecodeError:
            payload_dict = {}
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
    if isinstance(meta, str):
        try:
            meta_dict: Mapping[str, object] = json.loads(meta)
        except json.JSONDecodeError:
            meta_dict = {}
    else:
        meta_dict = dict(meta)
    return AuditLogEntry(
        actor_id=str(record["actor_id"]) if record["actor_id"] is not None else None,
        action=str(record["action"]),
        target_type=str(record["target_type"]),
        target_id=str(record["target_id"]),
        meta=meta_dict,
        created_at=record["created_at"],
    )


def _report_from_record(record: asyncpg.Record) -> ModerationReport:
    return ModerationReport(
        report_id=str(record["id"]),
        case_id=str(record["case_id"]),
        reporter_id=str(record["reporter_id"]),
        reason_code=str(record["reason_code"]),
        note=str(record["note"]) if record["note"] is not None else None,
        created_at=record["created_at"],
    )


def _appeal_from_record(record: asyncpg.Record) -> ModerationAppeal:
    return ModerationAppeal(
        appeal_id=str(record["id"]),
        case_id=str(record["case_id"]),
        appellant_id=str(record["appellant_id"]),
        note=str(record["note"]),
        status=str(record["status"]),
        reviewed_by=str(record["reviewed_by"]) if record["reviewed_by"] is not None else None,
        created_at=record["created_at"],
        reviewed_at=record["reviewed_at"],
    )
