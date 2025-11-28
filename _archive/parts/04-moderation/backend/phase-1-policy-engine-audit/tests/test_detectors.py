import pytest

from app.moderation.domain.detectors.bundle import DetectorSuite, InMemoryRateCounter, InMemoryRollingStore
from app.moderation.domain.detectors.dup_text import DuplicateTextDetector
from app.moderation.domain.detectors.links import LinkSafetyDetector
from app.moderation.domain.detectors.profanity import ProfanityDetector


def test_profanity_detector_levels() -> None:
    detector = ProfanityDetector(lexicon={"shenanigans": "medium"})
    assert detector.evaluate("hello world") == "unknown"
    assert detector.evaluate("foo fighters") == "low"
    assert detector.evaluate("shenanigans!") == "medium"


@pytest.mark.asyncio
async def test_duplicate_detector_triggers() -> None:
    store = InMemoryRollingStore()
    detector = DuplicateTextDetector(store=store, threshold=2)
    user_id = "user-1"

    assert await detector.evaluate(user_id, "hello world") is False
    assert await detector.evaluate(user_id, "hello world") is True


def test_link_safety_detector_flags() -> None:
    detector = LinkSafetyDetector(denylist=["bad.example"], max_links=2)
    result = detector.evaluate("Visit https://bad.example/now and https://ok.example/path")
    assert result["unsafe_links"] is True
    assert result["excessive_links"] is False


@pytest.mark.asyncio
async def test_detector_suite_composes_results() -> None:
    suite = DetectorSuite(
        profanity=ProfanityDetector(),
        dup_store=InMemoryRollingStore(),
        rate_counter=InMemoryRateCounter(),
        link_safety=LinkSafetyDetector(denylist=[]),
    )
    event = {"text": "foo bar", "actor_id": "user-2", "subject_type": "post", "trust_score": 15}
    signals = await suite.evaluate(event)
    assert "profanity" in signals
    assert "dup_text_5m" in signals
    assert "high_velocity_posts" in signals
