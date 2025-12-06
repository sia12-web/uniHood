"""Legal holds for data preservation requests.

Implements preservation holds that prevent data deletion for users
under legal investigation or preservation requests from law enforcement.
"""

from __future__ import annotations

from datetime import datetime, timedelta, timezone
from typing import Optional
from uuid import UUID, uuid4

from pydantic import BaseModel, Field

from app.infra.postgres import get_pool
from app.obs import metrics as obs_metrics


class LegalHold(BaseModel):
    """A legal preservation hold on user data."""

    id: UUID
    request_id: str
    user_ids: list[UUID]
    authority: str
    reason: Optional[str] = None
    created_by: str
    created_at: datetime
    expires_at: datetime
    released_at: Optional[datetime] = None
    released_by: Optional[str] = None
    notes: Optional[str] = None


class CreateHoldRequest(BaseModel):
    """Request to create a new legal hold."""

    request_id: str = Field(..., description="External reference number for the legal request")
    user_ids: list[UUID] = Field(..., min_length=1, description="User IDs to place under hold")
    authority: str = Field(..., description="Requesting authority (e.g., court, agency)")
    reason: Optional[str] = Field(None, description="Brief reason for the hold")
    expires_in_days: int = Field(default=90, ge=1, le=365, description="Hold duration in days")
    notes: Optional[str] = None


class HoldService:
    """Service for managing legal preservation holds."""

    async def create_hold(
        self,
        request: CreateHoldRequest,
        created_by: str,
    ) -> LegalHold:
        """Create a new preservation hold on user data."""
        pool = await get_pool()
        hold_id = uuid4()
        now = datetime.now(timezone.utc)
        expires_at = now + timedelta(days=request.expires_in_days)

        async with pool.acquire() as conn:
            await conn.execute(
                """
                INSERT INTO legal_holds (
                    id, request_id, user_ids, authority, reason,
                    created_by, created_at, expires_at, notes
                ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
                """,
                hold_id,
                request.request_id,
                request.user_ids,
                request.authority,
                request.reason,
                created_by,
                now,
                expires_at,
                request.notes,
            )

        obs_metrics.LEGAL_HOLDS_CREATED.inc()

        return LegalHold(
            id=hold_id,
            request_id=request.request_id,
            user_ids=request.user_ids,
            authority=request.authority,
            reason=request.reason,
            created_by=created_by,
            created_at=now,
            expires_at=expires_at,
            notes=request.notes,
        )

    async def release_hold(
        self,
        hold_id: UUID,
        released_by: str,
    ) -> Optional[LegalHold]:
        """Release a legal hold early."""
        pool = await get_pool()
        now = datetime.now(timezone.utc)

        async with pool.acquire() as conn:
            row = await conn.fetchrow(
                """
                UPDATE legal_holds
                SET released_at = $1, released_by = $2
                WHERE id = $3 AND released_at IS NULL
                RETURNING id, request_id, user_ids, authority, reason,
                          created_by, created_at, expires_at, released_at, released_by, notes
                """,
                now,
                released_by,
                hold_id,
            )

        if not row:
            return None

        obs_metrics.LEGAL_HOLDS_RELEASED.inc()
        return self._row_to_hold(row)

    async def extend_hold(
        self,
        hold_id: UUID,
        additional_days: int,
        extended_by: str,
    ) -> Optional[LegalHold]:
        """Extend a legal hold's expiration."""
        pool = await get_pool()

        async with pool.acquire() as conn:
            row = await conn.fetchrow(
                """
                UPDATE legal_holds
                SET expires_at = expires_at + INTERVAL '%s days',
                    notes = COALESCE(notes, '') || E'\n[' || NOW()::text || '] Extended by ' || $2
                WHERE id = $1 AND released_at IS NULL
                RETURNING id, request_id, user_ids, authority, reason,
                          created_by, created_at, expires_at, released_at, released_by, notes
                """,
                hold_id,
                extended_by,
            )
            if row:
                # Re-run with parameterized days since interval can't be parameterized
                await conn.execute(
                    """
                    UPDATE legal_holds
                    SET expires_at = expires_at + make_interval(days := $2)
                    WHERE id = $1
                    """,
                    hold_id,
                    additional_days,
                )
                row = await conn.fetchrow(
                    """
                    SELECT id, request_id, user_ids, authority, reason,
                           created_by, created_at, expires_at, released_at, released_by, notes
                    FROM legal_holds WHERE id = $1
                    """,
                    hold_id,
                )

        if not row:
            return None

        return self._row_to_hold(row)

    async def get_hold(self, hold_id: UUID) -> Optional[LegalHold]:
        """Get a specific legal hold by ID."""
        pool = await get_pool()

        async with pool.acquire() as conn:
            row = await conn.fetchrow(
                """
                SELECT id, request_id, user_ids, authority, reason,
                       created_by, created_at, expires_at, released_at, released_by, notes
                FROM legal_holds
                WHERE id = $1
                """,
                hold_id,
            )

        if not row:
            return None

        return self._row_to_hold(row)

    async def list_active_holds(self) -> list[LegalHold]:
        """List all active (non-released, non-expired) holds."""
        pool = await get_pool()
        now = datetime.now(timezone.utc)

        async with pool.acquire() as conn:
            rows = await conn.fetch(
                """
                SELECT id, request_id, user_ids, authority, reason,
                       created_by, created_at, expires_at, released_at, released_by, notes
                FROM legal_holds
                WHERE released_at IS NULL AND expires_at > $1
                ORDER BY created_at DESC
                """,
                now,
            )

        return [self._row_to_hold(row) for row in rows]

    async def list_holds_for_user(self, user_id: UUID) -> list[LegalHold]:
        """List all holds (active and inactive) for a specific user."""
        pool = await get_pool()

        async with pool.acquire() as conn:
            rows = await conn.fetch(
                """
                SELECT id, request_id, user_ids, authority, reason,
                       created_by, created_at, expires_at, released_at, released_by, notes
                FROM legal_holds
                WHERE $1 = ANY(user_ids)
                ORDER BY created_at DESC
                """,
                user_id,
            )

        return [self._row_to_hold(row) for row in rows]

    def _row_to_hold(self, row) -> LegalHold:
        """Convert a database row to a LegalHold model."""
        return LegalHold(
            id=row["id"],
            request_id=row["request_id"],
            user_ids=list(row["user_ids"]),
            authority=row["authority"],
            reason=row["reason"],
            created_by=row["created_by"],
            created_at=row["created_at"],
            expires_at=row["expires_at"],
            released_at=row["released_at"],
            released_by=row["released_by"],
            notes=row["notes"],
        )


async def is_user_under_hold(user_id: UUID) -> bool:
    """Check if a user is under any active legal hold.

    This is the primary check that should be called before any
    data deletion or purge operation.
    """
    pool = await get_pool()
    now = datetime.now(timezone.utc)

    async with pool.acquire() as conn:
        result = await conn.fetchval(
            """
            SELECT EXISTS(
                SELECT 1 FROM legal_holds
                WHERE $1 = ANY(user_ids)
                  AND released_at IS NULL
                  AND expires_at > $2
            )
            """,
            user_id,
            now,
        )

    return bool(result)


async def get_users_under_hold() -> set[UUID]:
    """Get all user IDs currently under any active legal hold.

    Useful for batch operations like retention purges.
    """
    pool = await get_pool()
    now = datetime.now(timezone.utc)

    async with pool.acquire() as conn:
        rows = await conn.fetch(
            """
            SELECT DISTINCT unnest(user_ids) as user_id
            FROM legal_holds
            WHERE released_at IS NULL AND expires_at > $1
            """,
            now,
        )

    return {row["user_id"] for row in rows}


# Singleton service instance
_service: Optional[HoldService] = None


def get_hold_service() -> HoldService:
    """Get the hold service singleton."""
    global _service
    if _service is None:
        _service = HoldService()
    return _service
