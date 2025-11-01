"""PostgreSQL-backed linkage repository."""

from __future__ import annotations

from typing import Sequence

import asyncpg

from app.moderation.domain.linkage import LinkageRecord, LinkageRepository


def _row_to_record(row: asyncpg.Record) -> LinkageRecord:
    return LinkageRecord(
        cluster_id=str(row["cluster_id"]),
        user_id=str(row["user_id"]),
        relation=str(row["relation"]),
        strength=int(row["strength"]),
        created_at=row["created_at"],
    )


class PostgresLinkageRepository(LinkageRepository):
    """Stores linkage relationships for moderation correlation."""

    def __init__(self, pool: asyncpg.Pool) -> None:
        self._pool = pool

    async def upsert(self, record: LinkageRecord) -> LinkageRecord:
        row = await self._pool.fetchrow(
            """
            INSERT INTO mod_linkage (cluster_id, user_id, relation, strength, created_at)
            VALUES ($1, $2, $3, $4, $5)
            ON CONFLICT (cluster_id, user_id, relation)
            DO UPDATE SET strength = EXCLUDED.strength, created_at = EXCLUDED.created_at
            RETURNING cluster_id, user_id, relation, strength, created_at
            """,
            record.cluster_id,
            record.user_id,
            record.relation,
            record.strength,
            record.created_at,
        )
        if row is None:  # pragma: no cover
            raise RuntimeError("Failed to upsert linkage record")
        return _row_to_record(row)

    async def list_for_user(self, user_id: str) -> Sequence[LinkageRecord]:
        rows = await self._pool.fetch(
            """
            SELECT cluster_id, user_id, relation, strength, created_at
            FROM mod_linkage
            WHERE user_id = $1
            ORDER BY created_at DESC
            """,
            user_id,
        )
        return [_row_to_record(row) for row in rows]

    async def list_cluster(self, cluster_id: str) -> Sequence[LinkageRecord]:
        rows = await self._pool.fetch(
            """
            SELECT cluster_id, user_id, relation, strength, created_at
            FROM mod_linkage
            WHERE cluster_id = $1
            ORDER BY created_at DESC
            """,
            cluster_id,
        )
        return [_row_to_record(row) for row in rows]

    async def remove_user(self, user_id: str) -> None:
        await self._pool.execute("DELETE FROM mod_linkage WHERE user_id = $1", user_id)
