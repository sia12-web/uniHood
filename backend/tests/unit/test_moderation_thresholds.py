from __future__ import annotations

from app.moderation.domain.thresholds import ModerationThresholds


def test_text_thresholds_hard_block() -> None:
    thresholds = ModerationThresholds.default()
    decision = thresholds.evaluate_text({"hate": 0.99, "toxicity": 0.20})
    assert decision.status == "blocked"
    assert decision.suggested_action == "remove"
    assert "hate_hard" in decision.reasons


def test_image_thresholds_soft_review() -> None:
    thresholds = ModerationThresholds.default()
    decision = thresholds.evaluate_image(nsfw_score=0.9, gore_score=0.1)
    assert decision.status == "needs_review"
    assert decision.suggested_action == "tombstone"
    assert decision.level == "medium"
