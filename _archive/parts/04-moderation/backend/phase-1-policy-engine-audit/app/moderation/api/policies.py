"""Policy inspection endpoints."""

from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Depends
from pydantic import BaseModel

from app.moderation.domain.container import get_policy
from app.moderation.domain.policy_engine import Decision, Policy, evaluate_policy

router = APIRouter(prefix="/api/mod/v1/policies", tags=["moderation-policies"])


class DryRunRequest(BaseModel):
    signals: dict[str, Any]
    trust_score: int | None = None


class DryRunResponse(BaseModel):
    action: str
    payload: dict[str, Any]
    severity: int
    reasons: list[str]

    @classmethod
    def from_decision(cls, decision: Decision) -> "DryRunResponse":
        return cls(
            action=decision.action,
            payload=dict(decision.payload),
            severity=decision.severity,
            reasons=list(decision.reasons),
        )


def get_policy_dep() -> Policy:
    return get_policy()


@router.post("/dry_run", response_model=DryRunResponse)
async def dry_run(body: DryRunRequest, policy: Policy = Depends(get_policy_dep)) -> DryRunResponse:
    decision = evaluate_policy(policy, body.signals, body.trust_score)
    return DryRunResponse.from_decision(decision)
