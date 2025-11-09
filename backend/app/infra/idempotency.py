from __future__ import annotations

from datetime import datetime, timedelta, timezone
from typing import Optional

from app.infra.postgres import get_pool


async def once(key: str, handler: str, ttl_seconds: int = 86400) -> Optional[str]:
    pool = await get_pool()
    async with pool.acquire() as conn:
        row = await conn.fetchrow(
            "SELECT result_id FROM idempotency_keys WHERE key=$1 AND expires_at > NOW()",
            key,
        )
        if row:
            return row["result_id"]
        exp = datetime.now(timezone.utc) + timedelta(seconds=ttl_seconds)
        await conn.execute(
            "INSERT INTO idempotency_keys(key, handler, result_id, expires_at) VALUES($1,$2,NULL,$3) ON CONFLICT DO NOTHING",
            key,
            handler,
            exp,
        )
        return None


async def complete(key: str, result_id: str) -> None:
    pool = await get_pool()
    async with pool.acquire() as conn:
        await conn.execute("UPDATE idempotency_keys SET result_id=$2 WHERE key=$1", key, result_id)
