"""IP reputation enrichment helpers."""

from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from typing import Protocol


@dataclass(slots=True)
class IpReputation:
    ip: str
    score: int
    risk_label: str
    asn: int | None
    updated_at: datetime


class IpReputationRepository(Protocol):
    async def get(self, ip: str) -> IpReputation | None:
        ...

    async def upsert(self, reputation: IpReputation) -> IpReputation:
        ...

    async def list_stale(self, before: datetime) -> list[IpReputation]:
        ...


class IpEnrichmentService:
    """Resolves ASN and risk labels for newly observed IPs."""

    def __init__(self, repository: IpReputationRepository, *, provider: "IpRiskProvider" | None = None) -> None:
        self._repo = repository
        self._provider = provider

    async def enrich(self, ip: str) -> IpReputation:
        cached = await self._repo.get(ip)
        now = datetime.now(timezone.utc)
        if cached and (now - cached.updated_at) < timedelta(hours=24):
            return cached
        lookup = await self._lookup(ip)
        reputation = IpReputation(
            ip=ip,
            score=lookup.score,
            risk_label=lookup.risk_label,
            asn=lookup.asn,
            updated_at=now,
        )
        return await self._repo.upsert(reputation)

    async def refresh_stale(self, *, before: datetime) -> list[IpReputation]:
        stale = await self._repo.list_stale(before)
        refreshed: list[IpReputation] = []
        for item in stale:
            refreshed.append(await self.enrich(item.ip))
        return refreshed

    async def _lookup(self, ip: str) -> "IpRiskResult":
        if self._provider is None:
            return IpRiskResult(score=50, risk_label="unknown", asn=None)
        return await self._provider.lookup(ip)


class IpRiskResult:
    def __init__(self, *, score: int, risk_label: str, asn: int | None) -> None:
        self.score = score
        self.risk_label = risk_label
        self.asn = asn


class IpRiskProvider(Protocol):
    async def lookup(self, ip: str) -> IpRiskResult:
        ...


class InMemoryIpReputationRepository(IpReputationRepository):
    def __init__(self) -> None:
        self._items: dict[str, IpReputation] = {}

    async def get(self, ip: str) -> IpReputation | None:
        return self._items.get(ip)

    async def upsert(self, reputation: IpReputation) -> IpReputation:
        self._items[reputation.ip] = reputation
        return reputation

    async def list_stale(self, before: datetime) -> list[IpReputation]:
        return [item for item in self._items.values() if item.updated_at < before]
