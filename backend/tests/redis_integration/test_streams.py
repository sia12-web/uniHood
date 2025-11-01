import pytest

from app.infra.redis import redis_client


@pytest.mark.asyncio
async def test_stream_append_and_trim():
    key = "x:presence.heartbeats"
    for idx in range(5):
        await redis_client.xadd(key, {"idx": idx})
    entries = await redis_client.xrange(key, count=5)
    assert len(entries) == 5
    # simulate trim to 3 entries
    await redis_client.xtrim(key, maxlen=3)
    trimmed = await redis_client.xrange(key, count=10)
    assert len(trimmed) == 3
