"""Legal request logging for compliance auditing.

Tracks all legal data requests (subpoenas, warrants, user requests)
for compliance reporting and audit trails.
"""

from __future__ import annotations

from datetime import datetime, timezone
from enum import Enum
from typing import Any, Optional
from uuid import UUID, uuid4

from pydantic import BaseModel, Field

from app.infra.postgres import get_pool


class LegalRequestType(str, Enum):
    """Types of legal data requests."""

    SUBPOENA = "subpoena"
    COURT_ORDER = "court_order"
    WARRANT = "warrant"
    PRESERVATION = "preservation"
    USER_ACCESS = "user_access"  # PIPEDA access request
    USER_DELETION = "user_deletion"  # PIPEDA deletion request
    USER_CORRECTION = "user_correction"  # PIPEDA correction request


class LegalRequest(BaseModel):
    """A logged legal data request."""

    id: UUID
    request_type: LegalRequestType
    authority: str
    reference_number: Optional[str] = None
    received_at: datetime
    responded_at: Optional[datetime] = None
    user_ids: list[UUID] = Field(default_factory=list)
    data_types: list[str] = Field(default_factory=list)
    data_produced: Optional[dict[str, Any]] = None
    notes: Optional[str] = None
    handled_by: str
    created_at: datetime


class LogRequestInput(BaseModel):
    """Input for logging a new legal request."""

    request_type: LegalRequestType
    authority: str
    reference_number: Optional[str] = None
    received_at: Optional[datetime] = None
    user_ids: list[UUID] = Field(default_factory=list)
    data_types: list[str] = Field(default_factory=list)
    notes: Optional[str] = None


class CompleteRequestInput(BaseModel):
    """Input for completing a legal request."""

    data_produced: Optional[dict[str, Any]] = None
    notes: Optional[str] = None


class RequestLogService:
    """Service for logging legal data requests."""

    async def log_request(
        self,
        input: LogRequestInput,
        handled_by: str,
    ) -> LegalRequest:
        """Log a new legal data request."""
        pool = await get_pool()
        request_id = uuid4()
        now = datetime.now(timezone.utc)
        received_at = input.received_at or now

        async with pool.acquire() as conn:
            await conn.execute(
                """
                INSERT INTO legal_request_log (
                    id, request_type, authority, reference_number,
                    received_at, user_ids, data_types, notes, handled_by, created_at
                ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
                """,
                request_id,
                input.request_type.value,
                input.authority,
                input.reference_number,
                received_at,
                input.user_ids,
                input.data_types,
                input.notes,
                handled_by,
                now,
            )

        return LegalRequest(
            id=request_id,
            request_type=input.request_type,
            authority=input.authority,
            reference_number=input.reference_number,
            received_at=received_at,
            user_ids=input.user_ids,
            data_types=input.data_types,
            notes=input.notes,
            handled_by=handled_by,
            created_at=now,
        )

    async def complete_request(
        self,
        request_id: UUID,
        input: CompleteRequestInput,
    ) -> Optional[LegalRequest]:
        """Mark a legal request as completed with response details."""
        pool = await get_pool()
        now = datetime.now(timezone.utc)

        async with pool.acquire() as conn:
            # Update notes if provided
            notes_update = ""
            if input.notes:
                notes_update = ", notes = COALESCE(notes, '') || E'\\n' || $4"

            row = await conn.fetchrow(
                f"""
                UPDATE legal_request_log
                SET responded_at = $1,
                    data_produced = COALESCE($2, data_produced)
                    {notes_update}
                WHERE id = $3
                RETURNING id, request_type, authority, reference_number,
                          received_at, responded_at, user_ids, data_types,
                          data_produced, notes, handled_by, created_at
                """,
                now,
                input.data_produced,
                request_id,
                input.notes if input.notes else None,
            )

        if not row:
            return None

        return self._row_to_request(row)

    async def get_request(self, request_id: UUID) -> Optional[LegalRequest]:
        """Get a specific legal request by ID."""
        pool = await get_pool()

        async with pool.acquire() as conn:
            row = await conn.fetchrow(
                """
                SELECT id, request_type, authority, reference_number,
                       received_at, responded_at, user_ids, data_types,
                       data_produced, notes, handled_by, created_at
                FROM legal_request_log
                WHERE id = $1
                """,
                request_id,
            )

        if not row:
            return None

        return self._row_to_request(row)

    async def list_requests(
        self,
        *,
        request_type: Optional[LegalRequestType] = None,
        start_date: Optional[datetime] = None,
        end_date: Optional[datetime] = None,
        limit: int = 50,
        offset: int = 0,
    ) -> list[LegalRequest]:
        """List legal requests with optional filters."""
        pool = await get_pool()

        conditions = []
        params: list[Any] = []
        param_idx = 1

        if request_type:
            conditions.append(f"request_type = ${param_idx}")
            params.append(request_type.value)
            param_idx += 1

        if start_date:
            conditions.append(f"received_at >= ${param_idx}")
            params.append(start_date)
            param_idx += 1

        if end_date:
            conditions.append(f"received_at <= ${param_idx}")
            params.append(end_date)
            param_idx += 1

        where_clause = ""
        if conditions:
            where_clause = "WHERE " + " AND ".join(conditions)

        params.extend([limit, offset])

        async with pool.acquire() as conn:
            rows = await conn.fetch(
                f"""
                SELECT id, request_type, authority, reference_number,
                       received_at, responded_at, user_ids, data_types,
                       data_produced, notes, handled_by, created_at
                FROM legal_request_log
                {where_clause}
                ORDER BY received_at DESC
                LIMIT ${param_idx} OFFSET ${param_idx + 1}
                """,
                *params,
            )

        return [self._row_to_request(row) for row in rows]

    async def list_requests_for_user(self, user_id: UUID) -> list[LegalRequest]:
        """List all legal requests involving a specific user."""
        pool = await get_pool()

        async with pool.acquire() as conn:
            rows = await conn.fetch(
                """
                SELECT id, request_type, authority, reference_number,
                       received_at, responded_at, user_ids, data_types,
                       data_produced, notes, handled_by, created_at
                FROM legal_request_log
                WHERE $1 = ANY(user_ids)
                ORDER BY received_at DESC
                """,
                user_id,
            )

        return [self._row_to_request(row) for row in rows]

    async def generate_compliance_report(
        self,
        start_date: datetime,
        end_date: datetime,
    ) -> dict[str, Any]:
        """Generate a compliance summary report for a date range."""
        pool = await get_pool()

        async with pool.acquire() as conn:
            # Get counts by type
            type_counts = await conn.fetch(
                """
                SELECT request_type, COUNT(*) as count
                FROM legal_request_log
                WHERE received_at BETWEEN $1 AND $2
                GROUP BY request_type
                """,
                start_date,
                end_date,
            )

            # Get response time stats
            response_stats = await conn.fetchrow(
                """
                SELECT
                    COUNT(*) as total,
                    COUNT(*) FILTER (WHERE responded_at IS NOT NULL) as responded,
                    AVG(EXTRACT(EPOCH FROM (responded_at - received_at))) as avg_response_seconds
                FROM legal_request_log
                WHERE received_at BETWEEN $1 AND $2
                """,
                start_date,
                end_date,
            )

            # Get unique users affected
            user_count = await conn.fetchval(
                """
                SELECT COUNT(DISTINCT u)
                FROM legal_request_log, unnest(user_ids) as u
                WHERE received_at BETWEEN $1 AND $2
                """,
                start_date,
                end_date,
            )

        return {
            "period": {
                "start": start_date.isoformat(),
                "end": end_date.isoformat(),
            },
            "total_requests": response_stats["total"] if response_stats else 0,
            "responded_requests": response_stats["responded"] if response_stats else 0,
            "avg_response_time_hours": (
                round(response_stats["avg_response_seconds"] / 3600, 2)
                if response_stats and response_stats["avg_response_seconds"]
                else None
            ),
            "requests_by_type": {
                row["request_type"]: row["count"] for row in type_counts
            },
            "unique_users_affected": user_count or 0,
        }

    def _row_to_request(self, row) -> LegalRequest:
        """Convert a database row to a LegalRequest model."""
        return LegalRequest(
            id=row["id"],
            request_type=LegalRequestType(row["request_type"]),
            authority=row["authority"],
            reference_number=row["reference_number"],
            received_at=row["received_at"],
            responded_at=row["responded_at"],
            user_ids=list(row["user_ids"]) if row["user_ids"] else [],
            data_types=list(row["data_types"]) if row["data_types"] else [],
            data_produced=dict(row["data_produced"]) if row["data_produced"] else None,
            notes=row["notes"],
            handled_by=row["handled_by"],
            created_at=row["created_at"],
        )


# Singleton service instance
_service: Optional[RequestLogService] = None


def get_request_log_service() -> RequestLogService:
    """Get the request log service singleton."""
    global _service
    if _service is None:
        _service = RequestLogService()
    return _service
