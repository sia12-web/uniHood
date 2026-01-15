from __future__ import annotations

import time
from datetime import datetime, timezone
from typing import Dict, Optional, Set
from uuid import UUID

import asyncpg

from app.infra.postgres import get_pool
from app.obs import metrics as obs_metrics

# Retention windows (days) - per O2-01 policy
MESSAGES_RETENTION_DAYS = 365
ATTACHMENTS_RETENTION_DAYS = 90
SESSIONS_RETENTION_DAYS = 180
INVITES_RETENTION_DAYS = 90
LOCATION_RETENTION_DAYS = 7
ANALYTICS_RETENTION_DAYS = 90
AUDIT_LOG_RETENTION_DAYS = 365


async def _get_users_under_hold() -> Set[UUID]:
    """Get all user IDs currently under legal hold."""
    pool = await get_pool()
    now = datetime.now(timezone.utc)

    async with pool.acquire() as conn:
        # Check if legal_holds table exists
        table_exists = await conn.fetchval(
            """
            SELECT EXISTS (
                SELECT 1 FROM information_schema.tables
                WHERE table_name = 'legal_holds'
            )
            """
        )
        if not table_exists:
            return set()

        rows = await conn.fetch(
            """
            SELECT DISTINCT unnest(user_ids) as user_id
            FROM legal_holds
            WHERE released_at IS NULL AND expires_at > $1
            """,
            now,
        )

    return {row["user_id"] for row in rows}


async def _log_retention_run(
    conn: asyncpg.Connection,
    table_name: str,
    records_purged: int,
    retention_days: int,
    skipped_holds: int,
    duration_ms: int,
    error: Optional[str] = None,
) -> None:
    """Log retention purge run to audit table."""
    # Check if audit table exists
    table_exists = await conn.fetchval(
        """
        SELECT EXISTS (
            SELECT 1 FROM information_schema.tables
            WHERE table_name = 'retention_audit_log'
        )
        """
    )
    if not table_exists:
        return

    await conn.execute(
        """
        INSERT INTO retention_audit_log (
            table_name, records_purged, retention_days, skipped_holds, duration_ms, error
        ) VALUES ($1, $2, $3, $4, $5, $6)
        """,
        table_name,
        records_purged,
        retention_days,
        skipped_holds,
        duration_ms,
        error,
    )


async def purge_soft_deleted(batch: int = 1000) -> Dict[str, int]:
    """Purge soft-deleted records respecting legal holds."""
    pool = await get_pool()
    counts: Dict[str, int] = {"messages": 0, "sessions": 0, "invitations": 0, "skipped_holds": 0}

    # Get users under legal hold to exclude from purge
    held_users = await _get_users_under_hold()

    async with pool.acquire() as conn:
        start = time.monotonic()
        purged, skipped = await _purge_messages(conn, MESSAGES_RETENTION_DAYS, batch, held_users)
        duration_ms = int((time.monotonic() - start) * 1000)
        counts["messages"] = purged
        counts["skipped_holds"] += skipped
        await _log_retention_run(conn, "messages", purged, MESSAGES_RETENTION_DAYS, skipped, duration_ms)

        start = time.monotonic()
        purged = await _purge_sessions(conn, SESSIONS_RETENTION_DAYS, batch)
        duration_ms = int((time.monotonic() - start) * 1000)
        counts["sessions"] = purged
        await _log_retention_run(conn, "sessions", purged, SESSIONS_RETENTION_DAYS, 0, duration_ms)

        start = time.monotonic()
        purged = await _purge_invitations(conn, INVITES_RETENTION_DAYS, batch)
        duration_ms = int((time.monotonic() - start) * 1000)
        counts["invitations"] = purged
        await _log_retention_run(conn, "invitations", purged, INVITES_RETENTION_DAYS, 0, duration_ms)

    # Update metrics
    for table, count in counts.items():
        if table != "skipped_holds" and count > 0:
            obs_metrics.RETENTION_PURGED.labels(table=table).inc(count)

    return counts


async def _purge_messages(
    conn: asyncpg.Connection,
    days: int,
    limit: int,
    held_users: Set[UUID],
) -> tuple[int, int]:
    """Purge old messages, skipping users under legal hold.

    Returns (purged_count, skipped_count).
    """
    if held_users:
        # Exclude held users from purge
        q = f"""
        WITH doomed AS (
            SELECT id FROM messages
            WHERE deleted_at IS NOT NULL
              AND deleted_at < NOW() - INTERVAL '{days} days'
              AND sender_id NOT IN (SELECT unnest($1::uuid[]))
            LIMIT {limit}
        )
        DELETE FROM messages t USING doomed d WHERE t.id = d.id
        RETURNING 1;
        """
        rows = await conn.fetch(q, list(held_users))

        # Count skipped
        skipped = await conn.fetchval(
            f"""
            SELECT COUNT(*) FROM messages
            WHERE deleted_at IS NOT NULL
              AND deleted_at < NOW() - INTERVAL '{days} days'
              AND sender_id IN (SELECT unnest($1::uuid[]))
            """,
            list(held_users),
        )
        return len(rows), skipped or 0
    else:
        q = f"""
        WITH doomed AS (
            SELECT id FROM messages
            WHERE deleted_at IS NOT NULL AND deleted_at < NOW() - INTERVAL '{days} days'
            LIMIT {limit}
        )
        DELETE FROM messages t USING doomed d WHERE t.id = d.id
        RETURNING 1;
        """
        rows = await conn.fetch(q)
        return len(rows), 0


async def _purge(
    conn: asyncpg.Connection,
    table: str,
    soft_col: str,
    created_col: str,
    days: int,
    limit: int,
) -> int:
    """Generic purge for tables without user association."""
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
