import asyncio

import pytest

from app.domain.proximity import live_sessions
from app.infra.redis import redis_client
from app.settings import settings


@pytest.mark.asyncio
async def test_keepalive_extends_ttl_when_activity_attached():
    original_interval = settings.presence_keepalive_interval_seconds
    original_idle = settings.presence_keepalive_idle_seconds
    original_ttl = settings.campus_ttl_seconds
    settings.presence_keepalive_interval_seconds = 0.05
    settings.presence_keepalive_idle_seconds = 0.3
    settings.campus_ttl_seconds = 1
    user_id = "user-keepalive"
    campus_id = "campus-keepalive"
    await redis_client.hset(
        f"presence:{user_id}",
        mapping={
            "lat": 20.0,
            "lon": 10.0,
            "accuracy_m": 5,
            "ts": 0,
            "device_id": "web",
            "campus_id": campus_id,
            "venue_id": "",
        },
    )
    await redis_client.expire(f"presence:{user_id}", settings.campus_ttl_seconds)
    try:
        await live_sessions.record_heartbeat(
            user_id,
            campus_id,
            lat=20.0,
            lon=10.0,
            accuracy_m=5,
            device_id="web",
            venue_id=None,
        )
        await live_sessions.attach_activity(user_id)
        await asyncio.sleep(0.12)
        ttl = await redis_client.ttl(f"presence:{user_id}")
        assert ttl > 0
        await live_sessions.detach_activity(user_id)
        await asyncio.sleep(settings.presence_keepalive_idle_seconds + settings.campus_ttl_seconds + 0.1)
        ttl_after = await redis_client.ttl(f"presence:{user_id}")
        assert ttl_after <= 0
    finally:
        settings.presence_keepalive_interval_seconds = original_interval
        settings.presence_keepalive_idle_seconds = original_idle
        settings.campus_ttl_seconds = original_ttl
        await live_sessions.shutdown()


@pytest.mark.asyncio
async def test_end_session_stops_additional_refreshes():
    original_interval = settings.presence_keepalive_interval_seconds
    original_idle = settings.presence_keepalive_idle_seconds
    original_ttl = settings.campus_ttl_seconds
    settings.presence_keepalive_interval_seconds = 0.05
    settings.presence_keepalive_idle_seconds = 0.5
    settings.campus_ttl_seconds = 1
    user_id = "user-end-session"
    campus_id = "campus-end-session"
    await redis_client.hset(
        f"presence:{user_id}",
        mapping={
            "lat": 25.0,
            "lon": 15.0,
            "accuracy_m": 4,
            "ts": 0,
            "device_id": "web",
            "campus_id": campus_id,
            "venue_id": "",
        },
    )
    await redis_client.expire(f"presence:{user_id}", settings.campus_ttl_seconds)
    try:
        await live_sessions.record_heartbeat(
            user_id,
            campus_id,
            lat=25.0,
            lon=15.0,
            accuracy_m=4,
            device_id="web",
            venue_id=None,
        )
        await live_sessions.attach_activity(user_id)
        await live_sessions.end_session(user_id)
        await asyncio.sleep(settings.presence_keepalive_interval_seconds + 0.05)
        await live_sessions.detach_activity(user_id)
        await asyncio.sleep(settings.campus_ttl_seconds + 0.2)
        ttl_after = await redis_client.ttl(f"presence:{user_id}")
        assert ttl_after <= 0
    finally:
        settings.presence_keepalive_interval_seconds = original_interval
        settings.presence_keepalive_idle_seconds = original_idle
        settings.campus_ttl_seconds = original_ttl
        await live_sessions.shutdown()
