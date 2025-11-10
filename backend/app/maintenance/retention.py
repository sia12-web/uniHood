from __future__ import annotations

from datetime import timedelta
from typing import Dict

import asyncpg

from app.infra.postgres import get_pool

# Defaults; consider moving to settings
MESSAGES_RETENTION_DAYS = 365
SESSIONS_RETENTION_DAYS = 180
INVITES_RETENTION_DAYS = 90


async def purge_soft_deleted(batch: int = 1000) -> Dict[str, int]:
    pool = await get_pool()
    counts: Dict[str, int] = {"messages": 0, "sessions": 0, "invitations": 0}
    async with pool.acquire() as conn:
        counts["messages"] += await _purge(conn, "messages", "deleted_at", "created_at", MESSAGES_RETENTION_DAYS, batch)
        counts["sessions"] += await _purge_sessions(conn, SESSIONS_RETENTION_DAYS, batch)
        counts["invitations"] += await _purge_invitations(conn, INVITES_RETENTION_DAYS, batch)
    return counts


async def _purge(
    conn: asyncpg.Connection,
    table: str,
    soft_col: str,
    created_col: str,
    days: int,
    limit: int,
) -> int:
    q = f"""
    WITH doomed AS (
      SELECT id FROM {table}
      WHERE {soft_col} IS NOT NULL AND {soft_col} < NOW() - INTERVAL '{days} days'
      LIMIT {limit}
    )
    DELETE FROM {table} t USING doomed d WHERE t.id = d.id
    RETURNING 1;
    """
    rows = await conn.fetch(q)
    return len(rows)


async def _purge_sessions(conn: asyncpg.Connection, days: int, limit: int) -> int:
    q = f"""
    WITH doomed AS (
      SELECT id FROM sessions
      WHERE (revoked = TRUE OR last_used_at < NOW() - INTERVAL '{days} days')
      LIMIT {limit}
    )
    DELETE FROM sessions s USING doomed d WHERE s.id = d.id
    RETURNING 1;
    """
    rows = await conn.fetch(q)
    return len(rows)


async def _purge_invitations(conn: asyncpg.Connection, days: int, limit: int) -> int:
    q = f"""
    WITH doomed AS (
      SELECT id FROM invitations
      WHERE deleted_at IS NOT NULL OR (decided_at IS NOT NULL AND decided_at < NOW() - INTERVAL '{days} days')
      LIMIT {limit}
    )
    DELETE FROM invitations i USING doomed d WHERE i.id = d.id
    RETURNING 1;
    """
    rows = await conn.fetch(q)
    return len(rows)
