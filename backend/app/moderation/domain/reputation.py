"""Reputation scoring utilities for Phase 5 trust & rate-limit updates."""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime, timedelta, timezone
from enum import Enum
from math import floor
from typing import Iterable, Mapping, MutableMapping, Protocol, Sequence

DEFAULT_NEUTRAL_SCORE = 50


class ReputationBand(str, Enum):
    """Discrete risk bands used for enforcement escalations."""

    GOOD = "good"
    NEUTRAL = "neutral"
    WATCH = "watch"
    RISK = "risk"
    BAD = "bad"


@dataclass(slots=True)
class ReputationScore:
    """Aggregated reputation snapshot for a user."""

    user_id: str
    score: int
    band: ReputationBand
    last_event_at: datetime


@dataclass(slots=True)
class ReputationEvent:
    """Immutable event describing a reputation adjustment."""

    user_id: str
    surface: str
    kind: str
    delta: int
    created_at: datetime
    device_fp: str | None = None
    ip: str | None = None
    meta: Mapping[str, object] = field(default_factory=dict)


class ReputationRepository(Protocol):
    """Storage layer contract for reputation data."""

    async def get_user_reputation(self, user_id: str) -> ReputationScore | None:
        ...

    async def upsert_user_reputation(self, score: ReputationScore) -> ReputationScore:
        ...

    async def insert_event(self, event: ReputationEvent) -> None:
        ...

    async def list_events(self, user_id: str, limit: int = 20, offset: int = 0) -> Sequence[ReputationEvent]:
        ...

    async def has_negative_event_since(self, user_id: str, since: datetime) -> bool:
        ...

    async def list_for_decay(self, before: datetime) -> Sequence[ReputationScore]:
        ...


def band_for_score(score: int) -> ReputationBand:
    """Map raw score to band thresholds."""

    if score <= 25:
        return ReputationBand.GOOD
    if score <= 45:
        return ReputationBand.NEUTRAL
    if score <= 60:
        return ReputationBand.WATCH
    if score <= 80:
        return ReputationBand.RISK
    return ReputationBand.BAD


def clamp(value: int, minimum: int = 0, maximum: int = 100) -> int:
    return max(minimum, min(maximum, value))


class ReputationService:
    """High-level interface for recording and aggregating reputation events."""

    def __init__(
        self,
        repository: ReputationRepository,
        *,
        decay_rate: float = 0.05,
        negative_window: timedelta = timedelta(hours=24),
    ) -> None:
        self._repo = repository
        self._decay_rate = decay_rate
        self._negative_window = negative_window

    async def get_or_create(self, user_id: str) -> ReputationScore:
        """Return the current score, seeding a neutral record when absent."""

        existing = await self._repo.get_user_reputation(user_id)
        if existing:
            return existing
        score = ReputationScore(
            user_id=user_id,
            score=DEFAULT_NEUTRAL_SCORE,
            band=band_for_score(DEFAULT_NEUTRAL_SCORE),
            last_event_at=datetime.now(timezone.utc),
        )
        return await self._repo.upsert_user_reputation(score)

    async def record_event(
        self,
        *,
        user_id: str,
        surface: str,
        kind: str,
        delta: int,
        device_fp: str | None = None,
        ip: str | None = None,
        meta: MutableMapping[str, object] | None = None,
        created_at: datetime | None = None,
    ) -> ReputationScore:
        """Persist an adjustment event and update the aggregated score."""

        meta_payload: Mapping[str, object] = dict(meta or {})
        timestamp = created_at or datetime.now(timezone.utc)
        event = ReputationEvent(
            user_id=user_id,
            surface=surface,
            kind=kind,
            delta=delta,
            created_at=timestamp,
            device_fp=device_fp,
            ip=ip,
            meta=meta_payload,
        )
        await self._repo.insert_event(event)

        current = await self.get_or_create(user_id)
        next_score = clamp(current.score + delta)
        score = ReputationScore(
            user_id=user_id,
            score=next_score,
            band=band_for_score(next_score),
            last_event_at=timestamp,
        )
        return await self._repo.upsert_user_reputation(score)

    async def adjust_manual(self, user_id: str, delta: int, note: str | None = None) -> ReputationScore:
        """Helper for staff adjustments outside of automatic signals."""

        meta = {"note": note} if note else {}
        return await self.record_event(
            user_id=user_id,
            surface="manual",
            kind="manual_adjust",
            delta=delta,
            meta=meta,
        )

    async def apply_decay_if_needed(self, score: ReputationScore, now: datetime | None = None) -> ReputationScore | None:
        """Apply exponential decay when the user has cooled off."""

        now = now or datetime.now(timezone.utc)
        if score.band not in (ReputationBand.WATCH, ReputationBand.RISK, ReputationBand.BAD):
            return None
        if await self._repo.has_negative_event_since(score.user_id, now - self._negative_window):
            return None
        decay_delta = floor(score.score * self._decay_rate)
        if decay_delta <= 0:
            return None
        return await self.record_event(
            user_id=score.user_id,
            surface="decay",
            kind="decay",
            delta=-decay_delta,
            created_at=now,
        )

    async def run_decay_pass(self, *, now: datetime | None = None) -> list[ReputationScore]:
        """Execute a decay sweep used by background jobs."""

        now = now or datetime.now(timezone.utc)
        candidates = await self._repo.list_for_decay(now - self._negative_window)
        results: list[ReputationScore] = []
        for score in candidates:
            updated = await self.apply_decay_if_needed(score, now=now)
            if updated:
                results.append(updated)
        return results

    async def list_recent_events(self, user_id: str, limit: int = 20, offset: int = 0) -> Sequence[ReputationEvent]:
        return await self._repo.list_events(user_id, limit=limit, offset=offset)

    @staticmethod
    def compose_risk(
        *,
        base_trust: int,
        ip_component: int = 0,
        shared_device_accounts: int = 0,
        velocity_penalties: Iterable[int] = (),
        content_penalty: int = 0,
        positive_offsets: Iterable[int] = (),
    ) -> int:
        """Utility for callers that need to recompute overall risk."""

        risk = clamp(100 - base_trust)
        risk = clamp(risk + min(ip_component, 20))
        if shared_device_accounts >= 3:
            risk = clamp(risk + 10)
        for penalty in velocity_penalties:
            risk = clamp(risk + penalty)
        risk = clamp(risk + content_penalty)
        for offset in positive_offsets:
            risk = clamp(risk + offset)
        return risk


class InMemoryReputationRepository(ReputationRepository):
    """Reference repository used in tests and developer environments."""

    def __init__(self) -> None:
        self.scores: dict[str, ReputationScore] = {}
        self.events: list[ReputationEvent] = []

    async def get_user_reputation(self, user_id: str) -> ReputationScore | None:
        return self.scores.get(user_id)

    async def upsert_user_reputation(self, score: ReputationScore) -> ReputationScore:
        self.scores[score.user_id] = score
        return score

    async def insert_event(self, event: ReputationEvent) -> None:
        self.events.append(event)

    async def list_events(self, user_id: str, limit: int = 20, offset: int = 0) -> Sequence[ReputationEvent]:
        filtered = [evt for evt in reversed(self.events) if evt.user_id == user_id]
        return filtered[offset : offset + limit]

    async def has_negative_event_since(self, user_id: str, since: datetime) -> bool:
        for event in reversed(self.events):
            if event.user_id != user_id:
                continue
            if event.created_at < since:
                break
            if event.delta > 0:
                return True
        return False

    async def list_for_decay(self, before: datetime) -> Sequence[ReputationScore]:
        return [score for score in self.scores.values() if score.last_event_at < before]
