"""Lightweight service container shared by phase 1 modules."""

from __future__ import annotations

from datetime import datetime
from typing import Any, Mapping, Optional

import asyncpg
from redis.asyncio import Redis

from .enforcement import (
    EnforcementHooks,
    InMemoryModerationRepository,
    ModerationCase,
    ModerationEnforcer,
    ModerationRepository,
)
from .policy_engine import Policy, PolicyRule
from .trust import TrustLedger, TrustRepository
from .detectors.bundle import DetectorSuite
from app.moderation.infra.postgres_repo import PostgresModerationRepository
from app.moderation.infra.trust_repo import PostgresTrustRepository


class InMemoryTrustRepository(TrustRepository):
    def __init__(self) -> None:
        self.store: dict[str, int] = {}

    async def get_score(self, user_id: str) -> int | None:
        return self.store.get(user_id)

    async def upsert_score(self, user_id: str, score: int, event_at: datetime) -> None:
        self.store[user_id] = score


class NoopHooks(EnforcementHooks):
    async def tombstone(self, case: ModerationCase, payload: Mapping[str, Any]) -> None:
        return None

    async def remove(self, case: ModerationCase, payload: Mapping[str, Any]) -> None:
        return None

    async def shadow_hide(self, case: ModerationCase, payload: Mapping[str, Any]) -> None:
        return None

    async def mute(self, case: ModerationCase, payload: Mapping[str, Any]) -> None:
        return None

    async def ban(self, case: ModerationCase, payload: Mapping[str, Any]) -> None:
        return None

    async def warn(self, case: ModerationCase, payload: Mapping[str, Any]) -> None:
        return None

    async def restrict_create(self, case: ModerationCase, payload: Mapping[str, Any], expires_at: datetime) -> None:
        return None


_repository: ModerationRepository = InMemoryModerationRepository()
_trust_repo: TrustRepository = InMemoryTrustRepository()
_trust_ledger = TrustLedger(repository=_trust_repo)
_hooks: EnforcementHooks = NoopHooks()
_detectors = DetectorSuite()
_policy = Policy(
    policy_id="default",
    version=1,
    default_action="none",
    rules=[
        PolicyRule(
            rule_id="profanity.basic",
            when={"text.any_of": ["profanity>medium"]},
            action="tombstone",
            severity=2,
            reason="profanity",
        ),
        PolicyRule(
            rule_id="spam.duplicate",
            when={"signals.all_of": ["dup_text_5m", "high_velocity_posts"]},
            action="shadow_hide",
            severity=2,
            reason="spam_duplicate",
        ),
        PolicyRule(
            rule_id="trust.low_throttle",
            when={"user.trust_below": 20},
            action="restrict_create",
            severity=1,
            payload={"targets": ["post", "comment", "message"], "ttl_minutes": 60},
            reason="low_trust_throttle",
        ),
    ],
)
_enforcer = ModerationEnforcer(repository=_repository, hooks=_hooks)


def configure(
    *,
    repository: Optional[ModerationRepository] = None,
    trust_repository: Optional[TrustRepository] = None,
    detectors: Optional[DetectorSuite] = None,
    hooks: Optional[EnforcementHooks] = None,
    policy: Optional[Policy] = None,
) -> None:
    global _repository, _trust_repo, _trust_ledger, _hooks, _detectors, _policy, _enforcer
    if repository is not None:
        _repository = repository
    if trust_repository is not None:
        _trust_repo = trust_repository
    if detectors is not None:
        _detectors = detectors
    if hooks is not None:
        _hooks = hooks
    if policy is not None:
        _policy = policy
    _trust_ledger = TrustLedger(repository=_trust_repo)
    _enforcer = ModerationEnforcer(repository=_repository, hooks=_hooks)


def configure_postgres(
    pool: asyncpg.Pool,
    redis_client: Redis,
    *,
    hooks: Optional[EnforcementHooks] = None,
    policy: Optional[Policy] = None,
) -> None:
    repo = PostgresModerationRepository(pool)
    trust_repo = PostgresTrustRepository(pool)
    detectors = DetectorSuite.from_redis(redis_client)
    configure(
        repository=repo,
        trust_repository=trust_repo,
        detectors=detectors,
        hooks=hooks,
        policy=policy,
    )


def get_repository() -> ModerationRepository:
    return _repository


def get_trust_ledger() -> TrustLedger:
    return _trust_ledger


def get_enforcer() -> ModerationEnforcer:
    return _enforcer


def get_policy() -> Policy:
    return _policy


def get_detectors() -> DetectorSuite:
    return _detectors
