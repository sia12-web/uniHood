"""Request gates that protect write endpoints based on moderation signals."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Protocol

from .trust import TrustLedger


class RateLimiter(Protocol):
    async def hit(self, user_id: str, subject_type: str) -> int:
        ...


class MuteRepository(Protocol):
    async def muted_until(self, user_id: str) -> int | None:
        ...


@dataclass
class ModerationDenied(Exception):
    status_code: int
    error_code: str


@dataclass
class CreateGuard:
    """Applies trust, mute, and rate checks before content creation."""

    trust: TrustLedger
    rate_limiter: RateLimiter
    mute_repo: MuteRepository

    async def enforce(self, user_id: str, subject_type: str) -> None:
        score = await self.trust.hydrate(user_id)
        if score < 10:
            raise ModerationDenied(status_code=429, error_code="account_limited")
        hits = await self.rate_limiter.hit(user_id, subject_type)
        if hits == -1:
            raise ModerationDenied(status_code=500, error_code="rate_limit_backend")
        if hits > self._limit_for(subject_type):
            raise ModerationDenied(status_code=429, error_code="slow_down")
        muted_until = await self.mute_repo.muted_until(user_id)
        if muted_until:
            raise ModerationDenied(status_code=403, error_code="muted_until")

    def _limit_for(self, subject_type: str) -> int:
        if subject_type == "post":
            return 5
        if subject_type == "comment":
            return 15
        return 10
