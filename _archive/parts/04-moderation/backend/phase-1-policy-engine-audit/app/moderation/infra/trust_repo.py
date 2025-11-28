"""Trust repository backed by PostgreSQL."""

from __future__ import annotations

from datetime import datetime

import asyncpg

from app.moderation.domain.trust import TrustRepository


class PostgresTrustRepository(TrustRepository):
    """Persists trust scores in the `trust_score` table."""

    def __init__(self, pool: asyncpg.Pool) -> None:
        self.pool = pool

    async def get_score(self, user_id: str) -> int | None:
        record = await self.pool.fetchrow("SELECT score FROM trust_score WHERE user_id = $1", user_id)
        if record is None:
            return None
        return int(record["score"])

    async def upsert_score(self, user_id: str, score: int, event_at: datetime) -> None:
        query = """
        INSERT INTO trust_score(user_id, score, last_event_at)
        VALUES ($1, $2, $3)
        ON CONFLICT (user_id)
        DO UPDATE SET score = EXCLUDED.score, last_event_at = EXCLUDED.last_event_at
        """
        await self.pool.execute(query, user_id, score, event_at)
