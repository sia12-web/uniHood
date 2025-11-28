"""Worker that updates trust scores based on moderation events."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Mapping, Protocol

from app.moderation.domain.trust import TrustLedger


class TrustEventBus(Protocol):
    async def get_events(self, limit: int = 100) -> list[Mapping[str, str]]:
        ...

    async def ack(self, event_id: str) -> None:
        ...


@dataclass
class TrustUpdater:
    """Applies trust adjustments from queued events."""

    ledger: TrustLedger
    bus: TrustEventBus
    positive_delta: int = 1
    negative_delta: int = -5

    async def run_once(self) -> None:
        events = await self.bus.get_events()
        for event in events:
            user_id = event.get("user_id")
            if not user_id:
                continue
            outcome = event.get("outcome")
            delta = self._delta_for(outcome)
            await self.ledger.adjust(user_id, delta)
            if event_id := event.get("event_id"):
                await self.bus.ack(event_id)

    def _delta_for(self, outcome: str | None) -> int:
        if outcome == "positive":
            return self.positive_delta
        if outcome == "severe_violation":
            return -10
        if outcome == "policy_violation":
            return self.negative_delta
        return 0
