import datetime

import pytest

from app.moderation.domain.gates import CreateGuard, ModerationDenied
from app.moderation.domain.trust import TrustLedger, TrustRepository


class MemoryTrustRepo(TrustRepository):
    def __init__(self) -> None:
        self.store: dict[str, int] = {}

    async def get_score(self, user_id: str) -> int | None:
        return self.store.get(user_id)

    async def upsert_score(self, user_id: str, score: int, event_at: datetime.datetime) -> None:
        self.store[user_id] = score


class StubRateLimiter:
    def __init__(self, responses: dict[str, int]) -> None:
        self.responses = responses

    async def hit(self, user_id: str, subject_type: str) -> int:
        return self.responses.get(f"{user_id}:{subject_type}", 0)


class StubMuteRepo:
    def __init__(self, values: dict[str, int]) -> None:
        self.values = values

    async def muted_until(self, user_id: str) -> int | None:
        return self.values.get(user_id)


@pytest.mark.asyncio
async def test_guard_blocks_low_trust() -> None:
    trust_repo = MemoryTrustRepo()
    ledger = TrustLedger(repository=trust_repo)
    trust_repo.store["user"] = 5
    guard = CreateGuard(trust=ledger, rate_limiter=StubRateLimiter({}), mute_repo=StubMuteRepo({}))

    with pytest.raises(ModerationDenied) as exc:
        await guard.enforce("user", "post")
    assert exc.value.status_code == 429
    assert exc.value.error_code == "account_limited"


@pytest.mark.asyncio
async def test_guard_blocks_rate_limit() -> None:
    trust_repo = MemoryTrustRepo()
    ledger = TrustLedger(repository=trust_repo)
    trust_repo.store["user"] = 50
    guard = CreateGuard(trust=ledger, rate_limiter=StubRateLimiter({"user:post": 6}), mute_repo=StubMuteRepo({}))

    with pytest.raises(ModerationDenied) as exc:
        await guard.enforce("user", "post")
    assert exc.value.error_code == "slow_down"


@pytest.mark.asyncio
async def test_guard_blocks_muted_user() -> None:
    trust_repo = MemoryTrustRepo()
    ledger = TrustLedger(repository=trust_repo)
    trust_repo.store["user"] = 50
    guard = CreateGuard(trust=ledger, rate_limiter=StubRateLimiter({}), mute_repo=StubMuteRepo({"user": 123}))

    with pytest.raises(ModerationDenied) as exc:
        await guard.enforce("user", "comment")
    assert exc.value.error_code == "muted_until"


@pytest.mark.asyncio
async def test_guard_allows_passing_user() -> None:
    trust_repo = MemoryTrustRepo()
    ledger = TrustLedger(repository=trust_repo)
    trust_repo.store["user"] = 50
    guard = CreateGuard(trust=ledger, rate_limiter=StubRateLimiter({"user:post": 1}), mute_repo=StubMuteRepo({}))

    await guard.enforce("user", "post")
