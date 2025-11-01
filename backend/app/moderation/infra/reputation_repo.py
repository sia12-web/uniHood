"""PostgreSQL-backed repositories for moderation reputation data."""

from __future__ import annotations

from datetime import datetime
from typing import Sequence

import asyncpg

from app.moderation.domain.reputation import (
    ReputationBand,
    ReputationEvent,
    ReputationRepository,
    ReputationScore,
)


def _row_to_score(row: asyncpg.Record) -> ReputationScore:
    return ReputationScore(
        user_id=str(row["user_id"]),
        score=int(row["score"]),
        band=ReputationBand(str(row["band"])),
        last_event_at=row["last_event_at"],
    )


def _row_to_event(row: asyncpg.Record) -> ReputationEvent:
    return ReputationEvent(
        user_id=str(row["user_id"]),
        surface=str(row["surface"]),
        kind=str(row["kind"]),
        delta=int(row["delta"]),
        created_at=row["created_at"],
        device_fp=row.get("device_fp"),
        ip=str(row["ip"]) if row.get("ip") is not None else None,
        meta=row.get("meta") or {},
    )


class PostgresReputationRepository(ReputationRepository):
    """Persists reputation aggregates and events using asyncpg."""

    def __init__(self, pool: asyncpg.Pool) -> None:
        self._pool = pool

    async def get_user_reputation(self, user_id: str) -> ReputationScore | None:
        row = await self._pool.fetchrow(
            "SELECT user_id, score, band, last_event_at FROM mod_user_reputation WHERE user_id = $1",
            user_id,
        )
        if row is None:
            return None
        return _row_to_score(row)

    async def upsert_user_reputation(self, score: ReputationScore) -> ReputationScore:
        row = await self._pool.fetchrow(
            """
            INSERT INTO mod_user_reputation (user_id, score, band, last_event_at)
            VALUES ($1, $2, $3, $4)
            ON CONFLICT (user_id)
            DO UPDATE SET score = EXCLUDED.score, band = EXCLUDED.band, last_event_at = EXCLUDED.last_event_at
            RETURNING user_id, score, band, last_event_at
            """,
            score.user_id,
            score.score,
            score.band.value,
            score.last_event_at,
        )
        if row is None:  # pragma: no cover - asyncpg always returns a row for RETURNING
            raise RuntimeError("Failed to upsert mod_user_reputation")
        return _row_to_score(row)

    async def insert_event(self, event: ReputationEvent) -> None:
        await self._pool.execute(
            """
            INSERT INTO mod_reputation_event (user_id, device_fp, ip, surface, kind, delta, meta, created_at)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
            """,
            event.user_id,
            event.device_fp,
            event.ip,
            event.surface,
            event.kind,
            event.delta,
            dict(event.meta),
            event.created_at,
        )

    async def list_events(self, user_id: str, limit: int = 20, offset: int = 0) -> Sequence[ReputationEvent]:
        rows = await self._pool.fetch(
            """
            SELECT user_id, device_fp, ip, surface, kind, delta, meta, created_at
            FROM mod_reputation_event
            WHERE user_id = $1
            ORDER BY created_at DESC
            OFFSET $2 LIMIT $3
            """,
            user_id,
            offset,
            limit,
        )
        return [_row_to_event(row) for row in rows]

    async def has_negative_event_since(self, user_id: str, since: datetime) -> bool:
        row = await self._pool.fetchrow(
            """
            SELECT 1
            FROM mod_reputation_event
            WHERE user_id = $1
              AND delta > 0
              AND created_at >= $2
            LIMIT 1
            """,
            user_id,
            since,
        )
        return row is not None

    async def list_for_decay(self, before: datetime) -> Sequence[ReputationScore]:
        rows = await self._pool.fetch(
            """
            SELECT user_id, score, band, last_event_at
            FROM mod_user_reputation
            WHERE last_event_at < $1
              AND band IN ('watch', 'risk', 'bad')
            """,
            before,
        )
        return [_row_to_score(row) for row in rows]
