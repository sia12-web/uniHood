"""Background keepalive manager for Go Live sessions."""

from __future__ import annotations

import asyncio
import logging
import re
import time
from contextlib import suppress
from dataclasses import dataclass
from typing import Dict, Optional

from app.infra.redis import redis_client
from app.obs import metrics as obs_metrics
from app.settings import settings

logger = logging.getLogger(__name__)


@dataclass
class LiveSession:
    user_id: str
    campus_id: str
    lat: float
    lon: float
    accuracy_m: int
    device_id: str
    venue_id: str
    last_heartbeat: float
    task: Optional[asyncio.Task] = None


_sessions: Dict[str, LiveSession] = {}
_activity_counts: Dict[str, int] = {}
_lock = asyncio.Lock()


async def record_heartbeat(
    user_id: str,
    campus_id: str,
    *,
    lat: float,
    lon: float,
    accuracy_m: int,
    device_id: str,
    venue_id: Optional[str],
) -> None:
    """Register a heartbeat and ensure the keepalive loop is running."""
    interval = float(settings.presence_keepalive_interval_seconds)
    if interval <= 0:
        return

    heartbeat_ts = time.time()
    async with _lock:
        session = _sessions.get(user_id)
        if session:
            session.campus_id = campus_id
            session.lat = lat
            session.lon = lon
            session.accuracy_m = int(accuracy_m)
            session.device_id = device_id
            session.venue_id = (venue_id or "").strip()
            session.last_heartbeat = heartbeat_ts
            if session.task is None or session.task.done():
                session.task = asyncio.create_task(_keepalive(session), name=f"presence-keepalive:{user_id}")
            return

        session = LiveSession(
            user_id=user_id,
            campus_id=campus_id,
            lat=lat,
            lon=lon,
            accuracy_m=int(accuracy_m),
            device_id=device_id,
            venue_id=(venue_id or "").strip(),
            last_heartbeat=heartbeat_ts,
        )
        session.task = asyncio.create_task(_keepalive(session), name=f"presence-keepalive:{user_id}")
        _sessions[user_id] = session


async def attach_activity(user_id: str) -> None:
    """Increment the activity counter for a user."""
    async with _lock:
        _activity_counts[user_id] = _activity_counts.get(user_id, 0) + 1


async def detach_activity(user_id: str) -> None:
    """Decrement the activity counter for a user."""
    async with _lock:
        count = _activity_counts.get(user_id)
        if not count:
            return
        if count <= 1:
            _activity_counts.pop(user_id, None)
        else:
            _activity_counts[user_id] = count - 1


async def end_session(user_id: str) -> None:
    """Terminate the keepalive loop for a user."""
    async with _lock:
        session = _sessions.pop(user_id, None)
    if not session:
        return
    task = session.task
    if task:
        task.cancel()
        with suppress(asyncio.CancelledError):
            await task


async def shutdown() -> None:
    """Cancel all active keepalive tasks (used on application shutdown/tests)."""
    async with _lock:
        sessions = list(_sessions.values())
        _sessions.clear()
        _activity_counts.clear()
    if not sessions:
        return
    for session in sessions:
        task = session.task
        if task:
            task.cancel()
    for session in sessions:
        task = session.task
        if not task:
            continue
        with suppress(asyncio.CancelledError):
            await task


async def _keepalive(session: LiveSession) -> None:
    """Refresh presence TTL while the user remains opted into live mode."""
    interval = max(0.05, float(settings.presence_keepalive_interval_seconds))
    idle_timeout = float(settings.presence_keepalive_idle_seconds)
    try:
        while True:
            await asyncio.sleep(interval)
            async with _lock:
                current = _sessions.get(session.user_id)
                if current is not session:
                    return
                campus_id = current.campus_id
                lat = current.lat
                lon = current.lon
                accuracy_m = current.accuracy_m
                device_id = current.device_id
                venue_id = current.venue_id
                last_heartbeat = current.last_heartbeat
                activity_count = _activity_counts.get(session.user_id, 0)
            now = time.time()
            if idle_timeout > 0 and activity_count <= 0 and (now - last_heartbeat) > idle_timeout:
                logger.debug("presence keepalive stopping for user=%s (idle)", session.user_id)
                return
            key = f"presence:{session.user_id}"
            exists = bool(await redis_client.exists(key))
            now_ms = int(now * 1000)
            last_heartbeat_ms = int(last_heartbeat * 1000)
            if not exists:
                mapping = {
                    "lat": lat,
                    "lon": lon,
                    "accuracy_m": accuracy_m,
                    # IMPORTANT: ts represents the last *location* heartbeat time.
                    # Keepalive should not make a user look "fresh" without a new
                    # location heartbeat, otherwise stale users can appear in Room mode.
                    "ts": last_heartbeat_ms,
                    "device_id": device_id,
                    "campus_id": campus_id,
                    "venue_id": venue_id,
                }
                await redis_client.hset(key, mapping=mapping)
            else:
                # Only extend TTL/online marker. Do NOT update ts here.
                await redis_client.hset(key, mapping={"updated_at": now_ms})
            await redis_client.expire(key, settings.campus_ttl_seconds)
            await redis_client.setex(f"online:user:{session.user_id}", settings.campus_ttl_seconds, "1")
            try:
                await redis_client.geoadd(f"geo:presence:{campus_id}", {session.user_id: (lon, lat)})
            except Exception:
                logger.debug("geoadd failed for user=%s", session.user_id, exc_info=True)
    except asyncio.CancelledError:
        raise
    except Exception:  # pragma: no cover - defensive logging
        logger.exception("presence keepalive loop failed for user=%s", session.user_id)
    finally:
        async with _lock:
            current = _sessions.get(session.user_id)
            if current is session:
                _sessions.pop(session.user_id, None)


async def run_presence_sweeper(client=redis_client, interval_s: int = 30) -> None:
    """Periodically trims campus GEO sets to remove stale presence members."""
    interval = max(1, int(interval_s))
    try:
        while True:
            await asyncio.sleep(interval)
            trimmed = await _sweep_once(client)
            if trimmed:
                logger.info("presence sweeper removed %s stale members", trimmed)
                obs_metrics.PRESENCE_SWEEPER_TRIMS.inc(trimmed)
    except asyncio.CancelledError:
        raise
    except Exception:  # pragma: no cover - defensive logging
        logger.exception("presence sweeper iteration failed")


async def _sweep_once(client) -> int:
    trimmed_total = 0
    cursor = 0
    pattern = re.compile(r"^presence:campus:(?P<campus>.+)$")
    while True:
        cursor, keys = await client.scan(cursor=cursor, match="presence:campus:*", count=100)
        for key in keys:
            match = pattern.match(key)
            campus_id = match.group("campus") if match else "unknown"
            members = await client.zrange(key, 0, 500)
            if not members:
                continue
            missing: list[str] = []
            for member in members:
                presence_key = f"presence:{member}"
                exists = await client.exists_key(presence_key) if hasattr(client, "exists_key") else await client.exists(presence_key)
                if not exists:
                    missing.append(member)
            if missing:
                await client.zrem(key, *missing)
                trimmed_total += len(missing)
                obs_metrics.PRESENCE_HEARTBEAT_MISS.labels(campus_id=str(campus_id)).inc(len(missing))
            count = await client.zcard(key)
            obs_metrics.PRESENCE_ONLINE.labels(campus_id=str(campus_id)).set(float(count))
        if cursor == 0:
            break
    return trimmed_total


__all__ = [
    "record_heartbeat",
    "attach_activity",
    "detach_activity",
    "end_session",
    "shutdown",
    "run_presence_sweeper",
]
