"""Unified write gate for Phase 5 trust and rate limiting."""

from __future__ import annotations

import re
from dataclasses import dataclass, field

from fastapi import HTTPException, status

from app.moderation.domain.reputation import ReputationBand, ReputationService
from app.moderation.domain.restrictions import RestrictionService
from app.moderation.domain.velocity import VelocityService
from app.obs import metrics

_EXTERNAL_LINK_RE = re.compile(r"https?://", re.IGNORECASE)


@dataclass(slots=True)
class WriteContext:
    """Mutable context shared with downstream handlers."""

    text: str | None = None
    captcha_ok: bool = False
    band: ReputationBand | None = None
    honey_tripped: bool = False
    shadow: bool = False
    strip_links: bool = False
    metadata: dict[str, object] = field(default_factory=dict)


class WriteGateV2:
    """Coordinator that enforces velocity, reputation, and honey rules."""

    def __init__(
        self,
        *,
        reputation: ReputationService,
        restrictions: RestrictionService,
        velocity: VelocityService,
        cooldown_reason: str = "velocity_trip",
        shadow_reason: str = "risk_shadow",
        captcha_reason: str = "captcha_required",
        link_shadow_reason: str = "link_cooloff",
        shadow_ttl_hours: int = 24,
        captcha_ttl_hours: int = 24,
        honey_shadow_hours: int | None = None,
        honey_captcha_hours: int | None = None,
        link_cooloff_hours: int = 24,
    ) -> None:
        self._reputation = reputation
        self._restrictions = restrictions
        self._velocity = velocity
        self._cooldown_reason = cooldown_reason
        self._shadow_reason = shadow_reason
        self._captcha_reason = captcha_reason
        self._link_shadow_reason = link_shadow_reason
        self._shadow_ttl_hours = max(1, shadow_ttl_hours)
        self._captcha_ttl_hours = max(1, captcha_ttl_hours)
        self._honey_shadow_hours = honey_shadow_hours or self._shadow_ttl_hours
        self._honey_captcha_hours = honey_captcha_hours or self._captcha_ttl_hours
        self._link_cooloff_hours = max(1, link_cooloff_hours)

    async def enforce(self, *, user_id: str, surface: str, ctx: WriteContext) -> WriteContext:
        band = ctx.band or (await self._reputation.get_or_create(user_id)).band
        flags = await self._restrictions.check_flags(user_id=user_id, scope=surface)

        if flags.cooldown_ttl:
            raise HTTPException(
                status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                detail={"code": "cooldown_active", "retry_after": flags.cooldown_ttl},
            )
        if flags.shadow_active:
            ctx.shadow = True

        trip = await self._velocity.observe(user_id=user_id, surface=surface, band=band)
        if trip:
            ttl_minutes = int(trip.cooldown.total_seconds() // 60) or 1
            await self._restrictions.apply_cooldown(
                user_id=user_id,
                scope=surface,
                minutes=ttl_minutes,
                reason=f"{self._cooldown_reason}.{trip.window.name}",
            )
            await self._reputation.record_event(
                user_id=user_id,
                surface=surface,
                kind="velocity_trip",
                delta=5,
            )
            metrics.ABUSE_VELOCITY_TRIPS.labels(surface=surface).inc()
            raise HTTPException(
                status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                detail={"code": "cooldown_active", "retry_after": ttl_minutes * 60},
            )

        if flags.captcha_required and not ctx.captcha_ok:
            metrics.CAPTCHA_REQUIRED_TOTAL.inc()
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail={"code": "captcha_required"},
            )

        if flags.link_cooloff and self._contains_external_links(ctx.text):
            ctx.strip_links = True
            ctx.metadata["link_cooloff"] = True

        if ctx.honey_tripped:
            await self._restrictions.record_honey_trip(user_id)
            await self._restrictions.require_captcha(
                user_id=user_id,
                scope=surface,
                hours=self._honey_captcha_hours,
                reason=self._captcha_reason,
            )
            await self._restrictions.apply_shadow(
                user_id=user_id,
                scope=surface,
                hours=self._honey_shadow_hours,
                reason=self._link_shadow_reason,
            )
            await self._reputation.record_event(
                user_id=user_id,
                surface=surface,
                kind="honey_trip",
                delta=20,
            )
            metrics.HONEY_TRIPS_TOTAL.inc()
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail={"code": "captcha_required"},
            )

        if band in (ReputationBand.RISK, ReputationBand.BAD) and surface in {"invite", "message", "post"}:
            if not ctx.shadow:
                await self._restrictions.apply_shadow(
                    user_id=user_id,
                    scope=surface,
                    hours=self._shadow_ttl_hours,
                    reason=self._shadow_reason,
                )
                metrics.SHADOW_WRITES_TOTAL.labels(surface=surface).inc()
            ctx.shadow = True

        metrics.REPUTATION_BAND_GAUGE.labels(band=band.value).set(1)
        return ctx

    @staticmethod
    def _contains_external_links(text: str | None) -> bool:
        if not text:
            return False
        return bool(_EXTERNAL_LINK_RE.search(text))
