from __future__ import annotations

import hashlib
from datetime import datetime, timedelta, timezone
from typing import Optional

from app.infra.postgres import get_pool
from app.obs import metrics as obs_metrics
from app.settings import settings


class IdempotencyConflictError(Exception):
    """Raised when an idempotency key is replayed with a conflicting payload."""


class IdempotencyUnavailableError(Exception):
    """Raised when idempotency storage is unavailable but required."""


def hash_payload(s: str) -> str:
    return hashlib.sha256(s.encode("utf-8")).hexdigest()


async def _pool_or_none():
    try:
        return await get_pool()
    except Exception:
        return None


async def begin(
    key: str,
    handler: str,
    *,
    payload_hash: Optional[str],
    ttl_s: int | None = None,
) -> Optional[dict[str, str]]:
    """Reserve or replay an idempotency key."""
    ttl = ttl_s or settings.idempotency_ttl_seconds
    pool = await _pool_or_none()
    if pool is None:
        obs_metrics.inc_idem_unavail()
        if settings.idempotency_required and settings.environment.lower() not in ("dev", "test"):
            raise IdempotencyUnavailableError("idempotency_unavailable")
        return None

    async with pool.acquire() as conn:
        row = await conn.fetchrow(
            "SELECT result_id, payload_hash FROM idempotency_keys WHERE key=$1 AND handler=$2 AND expires_at>NOW()",
            key,
            handler,
        )
        if row:
            existing_hash = row["payload_hash"]
            if payload_hash and existing_hash and existing_hash != payload_hash:
                obs_metrics.inc_idem_conflict()
                raise IdempotencyConflictError("idempotency_conflict")
            rid = row["result_id"]
            if rid:
                obs_metrics.inc_idem_hit()
                return {"result_id": str(rid)}
            return None

        exp = datetime.now(timezone.utc) + timedelta(seconds=ttl)
        await conn.execute(
            """
            INSERT INTO idempotency_keys(key, handler, result_id, payload_hash, expires_at)
            VALUES($1,$2,NULL,$3,$4)
            ON CONFLICT (key) DO NOTHING
            """,
            key,
            handler,
            payload_hash,
            exp,
        )
        obs_metrics.inc_idem_miss()
        return None


async def complete(key: str, handler: str, result_id: str) -> None:
    pool = await _pool_or_none()
    if pool is None:
        if settings.idempotency_required and settings.environment.lower() not in ("dev", "test"):
            raise IdempotencyUnavailableError("idempotency_unavailable")
        return
    async with pool.acquire() as conn:
        await conn.execute(
            "UPDATE idempotency_keys SET result_id=$3 WHERE key=$1 AND handler=$2",
            key,
            handler,
            result_id,
        )
