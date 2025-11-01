"""PostgreSQL repository for IP reputation records."""

from __future__ import annotations

from datetime import datetime

import asyncpg

from app.moderation.domain.ip_enrichment import IpReputation, IpReputationRepository


def _row_to_ip(row: asyncpg.Record) -> IpReputation:
    return IpReputation(
        ip=str(row["ip"]),
        score=int(row["score"]),
        risk_label=str(row["risk_label"]),
        asn=int(row["asn"]) if row.get("asn") is not None else None,
        updated_at=row["updated_at"],
    )


class PostgresIpReputationRepository(IpReputationRepository):
    def __init__(self, pool: asyncpg.Pool) -> None:
        self._pool = pool

    async def get(self, ip: str) -> IpReputation | None:
        row = await self._pool.fetchrow(
            "SELECT ip, asn, risk_label, score, updated_at FROM mod_ip_reputation WHERE ip = $1",
            ip,
        )
        if row is None:
            return None
        return _row_to_ip(row)

    async def upsert(self, reputation: IpReputation) -> IpReputation:
        row = await self._pool.fetchrow(
            """
            INSERT INTO mod_ip_reputation (ip, asn, risk_label, score, updated_at)
            VALUES ($1, $2, $3, $4, $5)
            ON CONFLICT (ip)
            DO UPDATE SET asn = EXCLUDED.asn, risk_label = EXCLUDED.risk_label, score = EXCLUDED.score, updated_at = EXCLUDED.updated_at
            RETURNING ip, asn, risk_label, score, updated_at
            """,
            reputation.ip,
            reputation.asn,
            reputation.risk_label,
            reputation.score,
            reputation.updated_at,
        )
        if row is None:  # pragma: no cover
            raise RuntimeError("Failed to upsert IP reputation")
        return _row_to_ip(row)

    async def list_stale(self, before: datetime) -> list[IpReputation]:
        rows = await self._pool.fetch(
            "SELECT ip, asn, risk_label, score, updated_at FROM mod_ip_reputation WHERE updated_at < $1",
            before,
        )
        return [_row_to_ip(row) for row in rows]
