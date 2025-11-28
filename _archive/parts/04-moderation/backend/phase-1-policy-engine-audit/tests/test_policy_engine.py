from app.moderation.domain.policy_engine import Policy, evaluate_policy


def test_policy_evaluate_no_matches() -> None:
    policy = Policy.from_dict(
        "test",
        {
            "default_action": "none",
            "version": 1,
            "rules": [
                {
                    "id": "rule-1",
                    "when": {"text.any_of": ["profanity>medium"]},
                    "then": {"action": "tombstone", "severity": 2},
                }
            ],
        },
    )

    decision = evaluate_policy(policy, {"profanity": "low"}, trust_score=50)

    assert decision.action == "none"
    assert decision.severity == 0
    assert decision.reasons == []


def test_policy_picks_highest_severity() -> None:
    policy = Policy.from_dict(
        "test",
        {
            "default_action": "none",
            "version": 1,
            "rules": [
                {
                    "id": "rule-1",
                    "when": {"text.any_of": ["profanity>medium"]},
                    "then": {"action": "tombstone", "severity": 2, "reason": "profanity"},
                },
                {
                    "id": "rule-2",
                    "when": {"signals.all_of": ["dup_text"]},
                    "then": {"action": "shadow_hide", "severity": 3, "reason": "dup"},
                },
            ],
        },
    )

    signals = {"profanity": "high", "dup_text": True}
    decision = evaluate_policy(policy, signals, trust_score=50)

    assert decision.action == "shadow_hide"
    assert decision.severity == 3
    assert sorted(decision.reasons) == ["dup", "profanity"]


def test_policy_trust_gate() -> None:
    policy = Policy.from_dict(
        "test",
        {
            "default_action": "none",
            "version": 1,
            "rules": [
                {
                    "id": "low-trust",
                    "when": {"user.trust_below": 20},
                    "then": {"action": "restrict_create", "severity": 1, "reason": "low_trust"},
                }
            ],
        },
    )

    decision = evaluate_policy(policy, {}, trust_score=15)

    assert decision.action == "restrict_create"
    assert decision.reasons == ["low_trust"]
