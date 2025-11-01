"""Velocity window helpers for Phase 5 rate limiting."""

from __future__ import annotations

from dataclasses import dataclass
from datetime import timedelta
from typing import Dict, Mapping, Protocol

from redis.asyncio import Redis

from app.infra.redis import RedisProxy
from app.moderation.domain.reputation import ReputationBand


@dataclass(slots=True)
class VelocityWindow:
    """Sliding-window configuration for a single rate-limit bucket."""

    name: str
    seconds: int
    limit: int
    cooldown_minutes: int


@dataclass(slots=True)
class VelocityTrip:
    """Result emitted when a velocity window is exceeded."""

    surface: str
    window: VelocityWindow
    count: int
    limit: int
    cooldown: timedelta


class VelocityConfig(Protocol):
    """Minimal interface for retrieving surface configuration."""

    def thresholds_for_surface(self, surface: str) -> list[VelocityWindow]:
        ...

    def band_multiplier(self, band: ReputationBand) -> float:
        ...


class StaticVelocityConfig:
    """Velocity configuration backed by simple dictionaries."""

    def __init__(
        self,
        surfaces: Mapping[str, list[VelocityWindow]],
        band_multipliers: Mapping[ReputationBand, float] | None = None,
    ) -> None:
        self._surfaces: Dict[str, list[VelocityWindow]] = {
            key: list(value) for key, value in surfaces.items()
        }
        default = {
            ReputationBand.GOOD: 1.0,
            ReputationBand.NEUTRAL: 1.0,
            ReputationBand.WATCH: 0.7,
            ReputationBand.RISK: 0.5,
            ReputationBand.BAD: 0.3,
        }
        self._multipliers: Dict[ReputationBand, float] = dict(default)
        if band_multipliers:
            for band, multiplier in band_multipliers.items():
                self._multipliers[band] = multiplier

    def thresholds_for_surface(self, surface: str) -> list[VelocityWindow]:
        return list(self._surfaces.get(surface, []))

    def band_multiplier(self, band: ReputationBand) -> float:
        return self._multipliers.get(band, 1.0)


class VelocityService:
    """Applies sliding-window counting using Redis buckets."""

    def __init__(
        self,
        redis: Redis | RedisProxy,
        config: VelocityConfig,
        *,
        namespace: str = "rl",
    ) -> None:
        self._redis = redis
        self._config = config
        self._namespace = namespace

    async def observe(
        self,
        *,
        user_id: str,
        surface: str,
        band: ReputationBand,
    ) -> VelocityTrip | None:
        """Increment counters and return the first window that trips."""

        windows = self._config.thresholds_for_surface(surface)
        if not windows:
            return None
        multiplier = max(0.1, self._config.band_multiplier(band))
        for window in windows:
            limit = max(1, int(window.limit * multiplier))
            key = f"{self._namespace}:{surface}:{user_id}:{window.seconds}"
            count = await self._redis.incr(key)
            await self._redis.expire(key, window.seconds)
            if count > limit:
                cooldown = timedelta(minutes=window.cooldown_minutes)
                return VelocityTrip(surface=surface, window=window, count=count, limit=limit, cooldown=cooldown)
        return None

    async def reset(self, *, user_id: str, surface: str) -> None:
        """Clear velocity counters for a surface."""

        windows = self._config.thresholds_for_surface(surface)
        if not windows:
            return
        keys = [f"{self._namespace}:{surface}:{user_id}:{window.seconds}" for window in windows]
        await self._redis.delete(*keys)


def default_velocity_config() -> StaticVelocityConfig:
    """Factory pairing the doc defaults with multipliers."""

    return StaticVelocityConfig(
        surfaces={
            "post": [
                VelocityWindow(name="window_60s", seconds=60, limit=3, cooldown_minutes=15),
                VelocityWindow(name="window_5m", seconds=300, limit=8, cooldown_minutes=60),
                VelocityWindow(name="window_1h", seconds=3600, limit=20, cooldown_minutes=60),
            ],
            "comment": [
                VelocityWindow(name="window_60s", seconds=60, limit=10, cooldown_minutes=15),
                VelocityWindow(name="window_5m", seconds=300, limit=40, cooldown_minutes=60),
                VelocityWindow(name="window_1h", seconds=3600, limit=200, cooldown_minutes=60),
            ],
            "message": [
                VelocityWindow(name="window_10s", seconds=10, limit=8, cooldown_minutes=15),
                VelocityWindow(name="window_60s", seconds=60, limit=30, cooldown_minutes=60),
                VelocityWindow(name="window_1h", seconds=3600, limit=120, cooldown_minutes=60),
            ],
            "invite": [
                VelocityWindow(name="window_1h", seconds=3600, limit=10, cooldown_minutes=60),
            ],
            "upload": [
                VelocityWindow(name="window_10m", seconds=600, limit=10, cooldown_minutes=60),
            ],
        }
    )
