from __future__ import annotations

from dataclasses import dataclass
from uuid import uuid4

import pytest

from app.moderation.domain.enforcement import InMemoryModerationRepository, ModerationEnforcer
from app.moderation.domain.policy_engine import Policy, PolicyRule
from app.moderation.domain.trust import TrustLedger, TrustRepository
from app.moderation.workers.actions_worker import ActionsWorker
from app.moderation.workers.ingress_worker import IngressWorker


class StubTrustRepository(TrustRepository):
    def __init__(self) -> None:
        self.scores: dict[str, int] = {}

    async def get_score(self, user_id: str) -> int | None:
        return self.scores.get(user_id)

    async def upsert_score(self, user_id: str, score: int, event_at) -> None:
        self.scores[user_id] = score


class FlagDetectors:
    async def evaluate(self, event):
        return {"flagged": str(event.get("flagged")) in {"1", "true", "True"}}


@dataclass
class RecordingHooks:
    calls: list[str]

    async def tombstone(self, case, payload):
        self.calls.append("tombstone")

    async def remove(self, case, payload):
        self.calls.append("remove")

    async def shadow_hide(self, case, payload):
        self.calls.append("shadow_hide")

    async def mute(self, case, payload):
        self.calls.append("mute")

    async def ban(self, case, payload):
        self.calls.append("ban")

    async def warn(self, case, payload):
        self.calls.append("warn")

    async def restrict_create(self, case, payload, expires_at):
        self.calls.append("restrict_create")


@pytest.mark.asyncio
async def test_ingress_and_actions_workers_flow(fake_redis):
    repository = InMemoryModerationRepository()
    hooks = RecordingHooks(calls=[])
    enforcer = ModerationEnforcer(repository=repository, hooks=hooks)  # type: ignore[arg-type]
    trust = TrustLedger(repository=StubTrustRepository())
    detectors = FlagDetectors()
    policy = Policy(
        policy_id="test",
        version=1,
        default_action="none",
        rules=[
            PolicyRule(
                rule_id="flagged",
                when={"signals.all_of": ["flagged"]},
                action="tombstone",
                severity=3,
                reason="auto_flag",
            )
        ],
    )
    ingress = IngressWorker(
        redis=fake_redis,
        detectors=detectors,
        policy=policy,
        trust=trust,
        enforcer=enforcer,
    )
    subject_id = uuid4()
    actor_id = uuid4()
    await fake_redis.xadd(
        "mod:ingress",
        {
            "subject_type": "post",
            "subject_id": str(subject_id),
            "actor_id": str(actor_id),
            "reason": "auto_policy",
            "flagged": "1",
        },
    )

    await ingress.run_once()

    decisions = await fake_redis.xrange("mod:decisions", count=10)
    assert len(decisions) == 1
    _, payload = decisions[0]
    assert payload["decision"] == "tombstone"
    assert "tombstone" in hooks.calls

    actions = ActionsWorker(redis=fake_redis, enforcer=enforcer)
    await actions.run_once()

    assert any(entry.action == "decision.consume" for entry in repository.audit_log)
