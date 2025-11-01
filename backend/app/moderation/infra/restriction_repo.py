"""PostgreSQL persistence for moderation restriction ledger."""

from __future__ import annotations

from typing import Sequence

import asyncpg

from app.moderation.domain.restrictions import Restriction, RestrictionMode, RestrictionRepository


def _row_to_restriction(row: asyncpg.Record) -> Restriction:
    return Restriction(
        id=str(row["id"]),
        user_id=str(row["user_id"]),
        scope=str(row["scope"]),
        mode=RestrictionMode(str(row["mode"])),
        reason=str(row["reason"]),
        ttl_seconds=int(row["ttl_seconds"]),
        created_at=row["created_at"],
        expires_at=row["expires_at"],
        created_by=str(row["created_by"]) if row.get("created_by") is not None else None,
    )


class PostgresRestrictionRepository(RestrictionRepository):
    """Stores restriction entries in mod_user_restriction."""

    def __init__(self, pool: asyncpg.Pool) -> None:
        self._pool = pool

    async def create(self, restriction: Restriction) -> Restriction:
        row = await self._pool.fetchrow(
            """
            INSERT INTO mod_user_restriction (id, user_id, scope, mode, reason, ttl_seconds, created_at, created_by)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
            RETURNING id, user_id, scope, mode, reason, ttl_seconds, created_at, expires_at, created_by
            """,
            restriction.id,
            restriction.user_id,
            restriction.scope,
            restriction.mode.value,
            restriction.reason,
            restriction.ttl_seconds,
            restriction.created_at,
            restriction.created_by,
        )
        if row is None:  # pragma: no cover - asyncpg always returns a row for RETURNING
            raise RuntimeError("Failed to insert restriction")
        return _row_to_restriction(row)

    async def revoke(self, restriction_id: str) -> None:
        await self._pool.execute("DELETE FROM mod_user_restriction WHERE id = $1", restriction_id)

    async def list_active(self, user_id: str) -> Sequence[Restriction]:
        rows = await self._pool.fetch(
            """
            SELECT id, user_id, scope, mode, reason, ttl_seconds, created_at, expires_at, created_by
            FROM mod_user_restriction
            WHERE user_id = $1 AND (expires_at IS NULL OR expires_at > now())
            ORDER BY created_at DESC
            """,
            user_id,
        )
        return [_row_to_restriction(row) for row in rows]

    async def list_all(self, user_id: str, *, include_inactive: bool = False) -> Sequence[Restriction]:
        if include_inactive:
            rows = await self._pool.fetch(
                """
                SELECT id, user_id, scope, mode, reason, ttl_seconds, created_at, expires_at, created_by
                FROM mod_user_restriction
                WHERE user_id = $1
                ORDER BY created_at DESC
                """,
                user_id,
            )
            return [_row_to_restriction(row) for row in rows]
        return await self.list_active(user_id)

    async def get(self, restriction_id: str) -> Restriction | None:
        row = await self._pool.fetchrow(
            """
            SELECT id, user_id, scope, mode, reason, ttl_seconds, created_at, expires_at, created_by
            FROM mod_user_restriction
            WHERE id = $1
            """,
            restriction_id,
        )
        if row is None:
            return None
        return _row_to_restriction(row)
