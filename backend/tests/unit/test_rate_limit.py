import pytest

from app.infra.rate_limit import allow


@pytest.mark.asyncio
async def test_rate_limit_allows_within_budget():
    assert await allow("hb", "u5", limit=2, window_seconds=60)
    assert await allow("hb", "u5", limit=2, window_seconds=60)


@pytest.mark.asyncio
async def test_rate_limit_blocks_when_budget_exhausted():
    await allow("nearby", "u6", limit=1, window_seconds=60)
    assert not await allow("nearby", "u6", limit=1, window_seconds=60)
