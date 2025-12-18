"""Anti-spoofing utilities for heartbeat ingestion."""

from __future__ import annotations

import math
import time
from typing import Dict

from app.infra.redis import redis_client

EARTH_RADIUS_M = 6_371_000
MAX_SPEED_MPS = 12
MAX_JUMP_DISTANCE_M = 1_000
MIN_JUMP_WINDOW_S = 30


def haversine(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    """Return the great-circle distance between two points in meters."""

    phi1, phi2 = math.radians(lat1), math.radians(lat2)
    dphi = math.radians(lat2 - lat1)
    dlambda = math.radians(lon2 - lon1)
    a = math.sin(dphi / 2) ** 2 + math.cos(phi1) * math.cos(phi2) * math.sin(dlambda / 2) ** 2
    return EARTH_RADIUS_M * 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))


def _parse_presence(raw: Dict[str, str]) -> tuple[float, float, int]:
    return float(raw["lat"]), float(raw["lon"]), int(raw["ts"])


async def is_plausible_movement(user_id: str, lat: float, lon: float, ts_client: int) -> bool:
    prev = await redis_client.hgetall(f"presence:{user_id}")
    if not prev or "lat" not in prev or "lon" not in prev or "ts" not in prev:
        return True
    try:
        prev_lat, prev_lon, prev_ts = _parse_presence(prev)
    except (ValueError, KeyError):
        return True

    # We store prev_ts using server time (ms), but receive ts_client from the browser.
    # If the client clock is behind the server (common on some devices/VMs),
    # ts_client - prev_ts can go negative and would cause false "implausible" rejects.
    dt_ms = ts_client - prev_ts
    if dt_ms <= 0:
        dt_ms = int(time.time() * 1000) - prev_ts
    # Guard against pathological values; never allow a 0/negative window.
    dt_s = max(1, dt_ms / 1000)
    distance_m = haversine(prev_lat, prev_lon, lat, lon)
    speed_mps = distance_m / dt_s
    # Allow a small tolerance to account for spherical distance vs. flat approximation
    if speed_mps > MAX_SPEED_MPS * 1.01:
        return False
    if distance_m > MAX_JUMP_DISTANCE_M and dt_s < MIN_JUMP_WINDOW_S:
        return False
    return True

