from __future__ import annotations

from datetime import datetime, timezone
from typing import Any


def now_utc() -> datetime:
    return datetime.now(timezone.utc)


async def soft_delete(conn: Any, table: str, id_col: str, row_id: Any):
    """Perform a soft-delete by setting deleted_at = NOW() if not already set.

    This is intentionally minimal SQL string building; callers must ensure
    `table` and `id_col` are trusted names (from constants) to avoid SQL injection.
    """
    q = f"UPDATE {table} SET deleted_at = NOW() WHERE {id_col} = $1 AND deleted_at IS NULL"
    return await conn.execute(q, row_id)
