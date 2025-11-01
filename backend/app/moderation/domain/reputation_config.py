"""Utilities for loading moderation reputation configuration."""

from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path
from typing import Mapping

import yaml

from app.moderation.domain.reputation import ReputationBand
from app.moderation.domain.velocity import StaticVelocityConfig, VelocityWindow


@dataclass(slots=True)
class ReputationConfig:
    velocity_config: StaticVelocityConfig
    shadow_ttl_hours: int = 24
    captcha_ttl_hours: int = 24
    honey_shadow_hours: int = 24
    honey_captcha_hours: int = 24
    link_cooloff_hours: int = 24


def load_reputation_config(path: str | Path) -> ReputationConfig:
    data: Mapping[str, object]
    with open(path, "r", encoding="utf-8") as handle:
        loaded = yaml.safe_load(handle) or {}
        if not isinstance(loaded, dict):
            raise ValueError("reputation config must be a mapping")
        data = loaded

    surfaces_spec = data.get("surfaces", {})
    surfaces: dict[str, list[VelocityWindow]] = {}
    if isinstance(surfaces_spec, dict):
        for surface, raw_windows in surfaces_spec.items():
            windows: list[VelocityWindow] = []
            if isinstance(raw_windows, dict):
                raw_windows = raw_windows.get("windows", [])
            if isinstance(raw_windows, list):
                for item in raw_windows:
                    if not isinstance(item, dict):
                        continue
                    windows.append(
                        VelocityWindow(
                            name=str(item.get("name", "window")),
                            seconds=int(item.get("seconds", 60)),
                            limit=int(item.get("limit", 1)),
                            cooldown_minutes=int(item.get("cooldown_minutes", 15)),
                        )
                    )
            surfaces[str(surface)] = windows

    band_spec = data.get("band_multipliers", {})
    band_multipliers: dict[ReputationBand, float] = {}
    if isinstance(band_spec, dict):
        for key, value in band_spec.items():
            try:
                band = ReputationBand(str(key))
            except ValueError:  # pragma: no cover - invalid band names ignored
                continue
            try:
                multiplier = float(value)
            except (TypeError, ValueError):  # pragma: no cover - ignore malformed values
                continue
            band_multipliers[band] = multiplier

    velocity_config = StaticVelocityConfig(surfaces=surfaces, band_multipliers=band_multipliers)

    shadow_defaults = data.get("shadow_defaults", {})
    captcha_spec = data.get("captcha", {})
    honey_spec = data.get("honey") if isinstance(data.get("honey"), dict) else {}

    def _hours(spec: object, key: str, default: int) -> int:
        if isinstance(spec, dict) and key in spec:
            try:
                return int(spec[key])
            except (TypeError, ValueError):  # pragma: no cover - invalid values fall back
                return default
        return default

    shadow_hours = _hours(shadow_defaults, "ttl_hours", 24)
    captcha_hours = _hours(captcha_spec, "ttl_hours", 24)
    link_hours = _hours(data.get("link_cooloff"), "ttl_hours", 24)
    honey_shadow = _hours(honey_spec, "shadow_hours", shadow_hours)
    honey_captcha = _hours(honey_spec, "captcha_hours", captcha_hours)

    return ReputationConfig(
        velocity_config=velocity_config,
        shadow_ttl_hours=shadow_hours,
        captcha_ttl_hours=captcha_hours,
        honey_shadow_hours=honey_shadow,
        honey_captcha_hours=honey_captcha,
        link_cooloff_hours=link_hours,
    )
