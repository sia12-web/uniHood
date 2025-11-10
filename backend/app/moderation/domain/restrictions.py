"""Graduated restriction ledger helpers for Phase 5."""

from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from enum import Enum
from typing import List, Protocol, Sequence

from redis.asyncio import Redis

from app.infra.redis import RedisProxy
from app.obs import metrics


class RestrictionMode(str, Enum):
    COOLDOWN = "cooldown"
    SHADOW_RESTRICT = "shadow_restrict"
    CAPTCHA = "captcha"
    HARD_BLOCK = "hard_block"


@dataclass(slots=True)
class Restriction:
    id: str
    user_id: str
    scope: str
    mode: RestrictionMode
    reason: str
    ttl_seconds: int
    created_at: datetime
    expires_at: datetime | None
    created_by: str | None = None

    def is_active(self, *, now: datetime | None = None) -> bool:
        now = now or datetime.now(timezone.utc)
        return self.expires_at is None or self.expires_at > now


@dataclass(slots=True)
class RestrictionFlags:
    cooldown_ttl: int | None = None
    shadow_active: bool = False
    captcha_required: bool = False
    link_cooloff: bool = False


class RestrictionRepository(Protocol):
    async def create(self, restriction: Restriction) -> Restriction:
        ...

    async def revoke(self, restriction_id: str) -> None:
        ...

    async def list_active(self, user_id: str) -> Sequence[Restriction]:
        ...

    async def list_all(self, user_id: str, *, include_inactive: bool = False) -> Sequence[Restriction]:
        ...

    async def get(self, restriction_id: str) -> Restriction | None:
        ...


class RestrictionService:
    """Applies ledger entries plus ephemeral Redis TTL flags."""

    def __init__(
        self,
        repository: RestrictionRepository,
        redis: Redis | RedisProxy,
        *,
        cooldown_prefix: str = "cooldown",
        shadow_prefix: str = "shadow",
        captcha_prefix: str = "captcha",
        link_prefix: str = "linkcooloff",
        honey_prefix: str = "honey:trip",
    ) -> None:
        self._repo = repository
        self._redis = redis
        self._cooldown_prefix = cooldown_prefix
        self._shadow_prefix = shadow_prefix
        self._captcha_prefix = captcha_prefix
        self._link_prefix = link_prefix
        self._honey_prefix = honey_prefix

    async def apply_restriction(
        self,
        *,
        user_id: str,
        scope: str,
        mode: RestrictionMode,
        reason: str,
        ttl: timedelta,
        created_by: str | None = None,
    ) -> Restriction:
        now = datetime.now(timezone.utc)
        expires_at = now + ttl if ttl.total_seconds() > 0 else None
        restriction = Restriction(
            id=f"{mode.value}:{user_id}:{int(now.timestamp())}",
            user_id=user_id,
            scope=scope,
            mode=mode,
            reason=reason,
            ttl_seconds=int(ttl.total_seconds()),
            created_at=now,
            expires_at=expires_at,
            created_by=created_by,
        )
        stored = await self._repo.create(restriction)
        await self._sync_flags(stored)
        metrics.RESTRICTIONS_ACTIVE_GAUGE.labels(mode=stored.mode.value, scope=stored.scope).inc()
        return stored

    async def apply_cooldown(self, *, user_id: str, scope: str, minutes: int, reason: str) -> Restriction:
        restriction = await self.apply_restriction(
            user_id=user_id,
            scope=scope,
            mode=RestrictionMode.COOLDOWN,
            reason=reason,
            ttl=timedelta(minutes=minutes),
        )
        key = self._cooldown_key(user_id, scope)
        await self._set_flag(key, restriction.ttl_seconds, nx=True)
        return restriction

    async def apply_shadow(self, *, user_id: str, scope: str, hours: int, reason: str) -> Restriction:
        restriction = await self.apply_restriction(
            user_id=user_id,
            scope=scope,
            mode=RestrictionMode.SHADOW_RESTRICT,
            reason=reason,
            ttl=timedelta(hours=hours),
        )
        await self._set_flag(self._shadow_key(user_id, scope), restriction.ttl_seconds)
        return restriction

    async def require_captcha(self, *, user_id: str, scope: str, hours: int, reason: str) -> Restriction:
        restriction = await self.apply_restriction(
            user_id=user_id,
            scope=scope,
            mode=RestrictionMode.CAPTCHA,
            reason=reason,
            ttl=timedelta(hours=hours),
        )
        await self._set_flag(self._captcha_key(user_id, scope), restriction.ttl_seconds)
        return restriction

    async def hard_block(self, *, user_id: str, scope: str, hours: int, reason: str) -> Restriction:
        restriction = await self.apply_restriction(
            user_id=user_id,
            scope=scope,
            mode=RestrictionMode.HARD_BLOCK,
            reason=reason,
            ttl=timedelta(hours=hours),
        )
        await self._set_flag(self._shadow_key(user_id, scope), restriction.ttl_seconds)
        await self._set_flag(self._cooldown_key(user_id, scope), restriction.ttl_seconds)
        return restriction

    async def link_cooloff(self, *, user_id: str, hours: int) -> None:
        await self._set_flag(f"{self._link_prefix}:{user_id}", int(hours * 3600))

    async def revoke(self, restriction_id: str) -> None:
        restriction = await self._repo.get(restriction_id)
        if restriction is None:
            return
        await self._repo.revoke(restriction_id)
        metrics.RESTRICTIONS_ACTIVE_GAUGE.labels(mode=restriction.mode.value, scope=restriction.scope).dec()
        await self._clear_flags(restriction.user_id, restriction.scope, restriction.mode)

    async def list_active(self, user_id: str) -> Sequence[Restriction]:
        return await self._repo.list_active(user_id)

    async def list_all(self, user_id: str, *, include_inactive: bool = False) -> Sequence[Restriction]:
        return await self._repo.list_all(user_id, include_inactive=include_inactive)

    async def get(self, restriction_id: str) -> Restriction | None:
        return await self._repo.get(restriction_id)

    async def check_flags(self, *, user_id: str, scope: str) -> RestrictionFlags:
        cooldown_ttl = await self._redis.ttl(self._cooldown_key(user_id, scope))
        shadow_exists = await self._redis.exists(self._shadow_key(user_id, scope))
        captcha_exists = await self._redis.exists(self._captcha_key(user_id, scope))
        link_exists = await self._redis.exists(f"{self._link_prefix}:{user_id}")
        return RestrictionFlags(
            cooldown_ttl=cooldown_ttl if cooldown_ttl and cooldown_ttl > 0 else None,
            shadow_active=bool(shadow_exists),
            captcha_required=bool(captcha_exists),
            link_cooloff=bool(link_exists),
        )

    async def record_honey_trip(self, user_id: str) -> int:
        key = f"{self._honey_prefix}:{user_id}"
        count = await self._redis.incr(key)
        await self._redis.expire(key, 86400)
        return count

    async def _sync_flags(self, restriction: Restriction) -> None:
        if restriction.mode is RestrictionMode.COOLDOWN:
            await self._set_flag(self._cooldown_key(restriction.user_id, restriction.scope), restriction.ttl_seconds)
        elif restriction.mode is RestrictionMode.SHADOW_RESTRICT:
            await self._set_flag(self._shadow_key(restriction.user_id, restriction.scope), restriction.ttl_seconds)
        elif restriction.mode is RestrictionMode.CAPTCHA:
            await self._set_flag(self._captcha_key(restriction.user_id, restriction.scope), restriction.ttl_seconds)
        elif restriction.mode is RestrictionMode.HARD_BLOCK:
            await self._set_flag(self._shadow_key(restriction.user_id, restriction.scope), restriction.ttl_seconds)
            await self._set_flag(self._cooldown_key(restriction.user_id, restriction.scope), restriction.ttl_seconds)

    async def _clear_flags(self, user_id: str, scope: str, mode: RestrictionMode) -> None:
        keys: List[str] = []
        if mode is RestrictionMode.COOLDOWN or mode is RestrictionMode.HARD_BLOCK:
            keys.append(self._cooldown_key(user_id, scope))
        if mode in (RestrictionMode.SHADOW_RESTRICT, RestrictionMode.HARD_BLOCK):
            keys.append(self._shadow_key(user_id, scope))
        if mode is RestrictionMode.CAPTCHA:
            keys.append(self._captcha_key(user_id, scope))
        if keys:
            await self._redis.delete(*keys)

    async def _set_flag(self, key: str, ttl_seconds: int | None, *, nx: bool = False) -> None:
        kwargs: dict[str, object] = {}
        if ttl_seconds and ttl_seconds > 0:
            kwargs["ex"] = ttl_seconds
        if nx:
            kwargs["nx"] = True
        await self._redis.set(key, "1", **kwargs)

    def _cooldown_key(self, user_id: str, scope: str) -> str:
        return f"{self._cooldown_prefix}:{user_id}:{scope}"

    def _shadow_key(self, user_id: str, scope: str) -> str:
        return f"{self._shadow_prefix}:{user_id}:{scope}"

    def _captcha_key(self, user_id: str, scope: str) -> str:
        return f"{self._captcha_prefix}:{user_id}:{scope}"


class InMemoryRestrictionRepository(RestrictionRepository):
    """Simple repository implementation for development and tests."""

    def __init__(self) -> None:
        self._items: dict[str, Restriction] = {}

    async def create(self, restriction: Restriction) -> Restriction:
        self._items[restriction.id] = restriction
        return restriction

    async def revoke(self, restriction_id: str) -> None:
        self._items.pop(restriction_id, None)

    async def list_active(self, user_id: str) -> Sequence[Restriction]:
        now = datetime.now(timezone.utc)
        return [item for item in self._items.values() if item.user_id == user_id and item.is_active(now=now)]

    async def list_all(self, user_id: str, *, include_inactive: bool = False) -> Sequence[Restriction]:
        if include_inactive:
            return [item for item in self._items.values() if item.user_id == user_id]
        return await self.list_active(user_id)

    async def get(self, restriction_id: str) -> Restriction | None:
        return self._items.get(restriction_id)
