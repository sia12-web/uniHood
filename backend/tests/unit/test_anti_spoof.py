import time

import pytest

from app.domain.proximity.anti_spoof import MAX_JUMP_DISTANCE_M, MAX_SPEED_MPS, is_plausible_movement
from app.infra.redis import redis_client


@pytest.mark.asyncio
async def test_first_heartbeat_is_allowed():
    assert await is_plausible_movement("u1", 0.0, 0.0, int(time.time() * 1000))


@pytest.mark.asyncio
async def test_rejects_unrealistic_speed():
    now_ms = int(time.time() * 1000)
    await redis_client.hset(
        "presence:u2",
        mapping={"lat": 0.0, "lon": 0.0, "ts": now_ms - 1_000},
    )
    # Move ~1km in 1s => 1000 m/s > MAX_SPEED
    assert not await is_plausible_movement("u2", 0.0, 0.009, now_ms)


@pytest.mark.asyncio
async def test_rejects_large_jump_in_short_time():
    now_ms = int(time.time() * 1000)
    await redis_client.hset(
        "presence:u3",
        mapping={"lat": 0.0, "lon": 0.0, "ts": now_ms - 5_000},
    )
    meters_per_degree = 111_000
    jump_lon = (MAX_JUMP_DISTANCE_M + 100) / meters_per_degree
    assert not await is_plausible_movement("u3", 0.0, jump_lon, now_ms)


@pytest.mark.asyncio
async def test_allows_reasonable_movement():
    now_ms = int(time.time() * 1000)
    await redis_client.hset(
        "presence:u4",
        mapping={"lat": 0.0, "lon": 0.0, "ts": now_ms - 5_000},
    )
    moderate_lon = (MAX_SPEED_MPS * 5) / 111_000
    assert await is_plausible_movement("u4", 0.0, moderate_lon, now_ms)
