"""Placeholder for the Phase 2 appeals worker."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Mapping, Protocol


class RedisStream(Protocol):
    async def xread(self, streams: Mapping[str, str], count: int, block: int) -> list[Any]:
        ...


class NotificationService(Protocol):
    async def notify_moderators(self, payload: Mapping[str, Any]) -> None:
        ...


@dataclass
class AppealsWorker:
    redis: RedisStream
    notifications: NotificationService
    stream_key: str = "mod:appeals"
    batch_size: int = 100
    block_ms: int = 5000
    last_id: str = "0-0"

    async def run_once(self) -> None:
        """Consume appeal submissions and fan out notifications (Phase 2 placeholder)."""

        raise NotImplementedError("Phase 2 scaffold – implement notification fan-out")
