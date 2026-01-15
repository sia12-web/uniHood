"""Policy evaluation primitives for the moderation stack."""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any, Iterable, List, Mapping, Optional


@dataclass
class PolicyRule:
    """Represents a single rule definition loaded from JSON."""

    rule_id: str
    when: Mapping[str, Any]
    action: str
    severity: int = 0
    reason: Optional[str] = None
    payload: Mapping[str, Any] = field(default_factory=dict)

    @staticmethod
    def from_dict(data: Mapping[str, Any]) -> "PolicyRule":
        then = data.get("then", {})
        return PolicyRule(
            rule_id=str(data.get("id")),
            when=data.get("when", {}),
            action=str(then.get("action", "none")),
            severity=int(then.get("severity", 0)),
            reason=then.get("reason"),
            payload=then.get("payload", {}),
        )


@dataclass
class Policy:
    """Materialized policy definition."""

    policy_id: str
    version: int
    rules: List[PolicyRule]
    default_action: str = "none"

    @staticmethod
    def from_dict(policy_id: str, data: Mapping[str, Any]) -> "Policy":
        default_action = str(data.get("default_action", "none"))
        rules = [PolicyRule.from_dict(rule) for rule in data.get("rules", [])]
        return Policy(
            policy_id=policy_id,
            version=int(data.get("version", 1)),
            rules=rules,
            default_action=default_action,
        )


@dataclass
class Decision:
    """Output of a policy evaluation."""

    action: str
    severity: int
    payload: Mapping[str, Any]
    reasons: List[str]

    @property
    def is_noop(self) -> bool:
        return self.action == "none" and not self.reasons


class PredicateEvaluator:
    """Helpers to evaluate predicates inside policy rules."""

    def __init__(self, signals: Mapping[str, Any], trust_score: Optional[int]) -> None:
        self.signals = signals
        self.trust_score = trust_score if trust_score is not None else 50

    def matches(self, expression: Mapping[str, Any]) -> bool:
        for predicate, value in expression.items():
            if predicate == "text.any_of":
                if not self._resolve_text_any_of(value):
                    return False
            elif predicate == "image.any_of":
                if not self._resolve_image_any_of(value):
                    return False
            elif predicate == "signals.all_of":
                if not self._resolve_signals_all_of(value):
                    return False
            elif predicate == "user.trust_below":
                if not self._resolve_trust_below(value):
                    return False
            else:
                return False
        return True

    def _resolve_text_any_of(self, labels: Iterable[str]) -> bool:
        profanity = str(self.signals.get("profanity", "unknown"))
        return any(_compare_label(profanity, label) for label in labels)

    def _resolve_image_any_of(self, labels: Iterable[str]) -> bool:
        nsfw = str(self.signals.get("nsfw", "unknown"))
        return any(_compare_label(nsfw, label) for label in labels)

    def _resolve_signals_all_of(self, keys: Iterable[str]) -> bool:
        for key in keys:
            if not bool(self.signals.get(key)):
                return False
        return True

    def _resolve_trust_below(self, threshold: Any) -> bool:
        try:
            bound = int(threshold)
        except (TypeError, ValueError):
            return False
        return self.trust_score < bound


def evaluate_policy(policy: Policy, signals: Mapping[str, Any], trust_score: Optional[int]) -> Decision:
    """Evaluate a policy against detector signals for a moderation event."""

    evaluator = PredicateEvaluator(signals, trust_score)
    matches: List[PolicyRule] = []
    for rule in policy.rules:
        if evaluator.matches(rule.when):
            matches.append(rule)
    if not matches:
        return Decision(action=policy.default_action, severity=0, payload={}, reasons=[])
    winner = max(matches, key=lambda rule: rule.severity)
    reasons = [rule.reason for rule in matches if rule.reason]
    return Decision(action=winner.action, severity=winner.severity, payload=winner.payload, reasons=reasons)


def _compare_label(observed: str, predicate: str) -> bool:
    """Compares labels of the form 'profanity>medium'."""

    if ">" not in predicate:
        return observed == predicate
    signal, threshold = predicate.split(">", 1)
    if signal not in {"profanity", "nsfw"}:
        return False
    order = ["unknown", "low", "medium", "high"]
    try:
        observed_idx = order.index(observed)
        threshold_idx = order.index(threshold)
    except ValueError:
        return False
    return observed_idx >= threshold_idx
