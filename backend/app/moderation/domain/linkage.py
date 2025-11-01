"""Linkage clustering utilities for abuse correlation."""

from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Iterable, Protocol, Sequence


@dataclass(slots=True)
class LinkageRecord:
    cluster_id: str
    user_id: str
    relation: str
    strength: int
    created_at: datetime


class LinkageRepository(Protocol):
    async def upsert(self, record: LinkageRecord) -> LinkageRecord:
        ...

    async def list_for_user(self, user_id: str) -> Sequence[LinkageRecord]:
        ...

    async def list_cluster(self, cluster_id: str) -> Sequence[LinkageRecord]:
        ...

    async def remove_user(self, user_id: str) -> None:
        ...


class LinkageService:
    """Manages linkage clusters derived from devices, IP ranges, and cookies."""

    def __init__(self, repository: LinkageRepository) -> None:
        self._repo = repository

    async def record_shared_device(self, *, cluster_id: str, user_id: str, strength: int) -> LinkageRecord:
        record = LinkageRecord(
            cluster_id=cluster_id,
            user_id=user_id,
            relation="shared_device",
            strength=strength,
            created_at=datetime.now(timezone.utc),
        )
        return await self._repo.upsert(record)

    async def record_shared_ip(self, *, cluster_id: str, user_id: str, strength: int) -> LinkageRecord:
        record = LinkageRecord(
            cluster_id=cluster_id,
            user_id=user_id,
            relation="shared_ip_24h",
            strength=strength,
            created_at=datetime.now(timezone.utc),
        )
        return await self._repo.upsert(record)

    async def record_cookie_seed(self, *, cluster_id: str, user_id: str, strength: int) -> LinkageRecord:
        record = LinkageRecord(
            cluster_id=cluster_id,
            user_id=user_id,
            relation="shared_cookie_seed",
            strength=strength,
            created_at=datetime.now(timezone.utc),
        )
        return await self._repo.upsert(record)

    async def peers_for_user(self, user_id: str) -> Sequence[LinkageRecord]:
        return await self._repo.list_for_user(user_id)

    async def remove_user(self, user_id: str) -> None:
        await self._repo.remove_user(user_id)


class InMemoryLinkageRepository(LinkageRepository):
    """Repository storing linkage clusters in memory for local development."""

    def __init__(self) -> None:
        self._records: dict[tuple[str, str, str], LinkageRecord] = {}

    async def upsert(self, record: LinkageRecord) -> LinkageRecord:
        key = (record.cluster_id, record.user_id, record.relation)
        self._records[key] = record
        return record

    async def list_for_user(self, user_id: str) -> Sequence[LinkageRecord]:
        return [record for record in self._records.values() if record.user_id == user_id]

    async def list_cluster(self, cluster_id: str) -> Sequence[LinkageRecord]:
        return [record for record in self._records.values() if record.cluster_id == cluster_id]

    async def remove_user(self, user_id: str) -> None:
        keys = [key for key, record in self._records.items() if record.user_id == user_id]
        for key in keys:
            self._records.pop(key, None)
