"""Configuration helpers for moderation safety thresholds."""

from __future__ import annotations

import json
import logging
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Mapping

logger = logging.getLogger(__name__)


@dataclass(frozen=True)
class ThresholdDecision:
    """Outcome returned by threshold evaluations."""

    status: str
    suggested_action: str
    reasons: tuple[str, ...]
    level: str


@dataclass(frozen=True)
class ImageThresholdConfig:
    hard_block: Mapping[str, float]
    soft_review: Mapping[str, float]


@dataclass(frozen=True)
class TextThresholdConfig:
    hard_block: Mapping[str, float]
    soft_enforce: Mapping[str, float]


@dataclass(frozen=True)
class UrlThresholdConfig:
    malicious: str
    suspicious: str


@dataclass(frozen=True)
class ModerationThresholds:
    """Container for safety thresholds with helper evaluators."""

    text: TextThresholdConfig
    image: ImageThresholdConfig
    url: UrlThresholdConfig
    surfaces: Mapping[str, "ModerationThresholds"]
    sampling: Mapping[str, float]

    @staticmethod
    def default() -> "ModerationThresholds":
        return ModerationThresholds(
            text=TextThresholdConfig(
                hard_block={"hate": 0.98, "selfharm": 0.98},
                soft_enforce={"toxicity": 0.92, "harassment": 0.92},
            ),
            image=ImageThresholdConfig(
                hard_block={"nsfw": 0.97, "gore": 0.80},
                soft_review={"nsfw": 0.85},
            ),
            url=UrlThresholdConfig(malicious="tombstone", suspicious="warn"),
            surfaces={},
            sampling={"borderline_nsfw": 0.1},
        )

    def surface(self, name: str | None) -> "ModerationThresholds":
        if not name:
            return self
        return self.surfaces.get(name, self)

    # --- Image -----------------------------------------------------------

    def evaluate_image(
        self,
        *,
        nsfw_score: float,
        gore_score: float,
        hash_label: str | None = None,
        surface: str | None = None,
    ) -> ThresholdDecision:
        ctx = self.surface(surface)
        thresholds = ctx.image
        reasons: list[str] = []
        level = self._image_level(nsfw_score, thresholds)
        status = "clean"
        suggested = "none"
        if hash_label in {"csam", "terror"}:
            status = "blocked"
            suggested = "remove"
            reasons.append(f"hash:{hash_label}")
            level = "critical"
        elif gore_score >= thresholds.hard_block.get("gore", 1.0) or nsfw_score >= thresholds.hard_block.get("nsfw", 1.0):
            status = "quarantined"
            suggested = "remove"
            if gore_score >= thresholds.hard_block.get("gore", 1.0):
                reasons.append("gore_high")
            if nsfw_score >= thresholds.hard_block.get("nsfw", 1.0):
                reasons.append("nsfw_high")
        elif nsfw_score >= thresholds.soft_review.get("nsfw", 1.0):
            status = "needs_review"
            suggested = "tombstone"
            reasons.append("nsfw_medium")
        else:
            reasons.append("nsfw_low")
        return ThresholdDecision(status=status, suggested_action=suggested, reasons=tuple(reasons), level=level)

    def _image_level(self, score: float, thresholds: ImageThresholdConfig | None = None) -> str:
        cfg = thresholds or self.image
        hard = cfg.hard_block.get("nsfw", 1.0)
        soft = cfg.soft_review.get("nsfw", 1.0)
        if score >= hard:
            return "high"
        if score >= soft:
            return "medium"
        return "low"

    # --- Text ------------------------------------------------------------

    def evaluate_text(
        self,
        scores: Mapping[str, float],
        *,
        surface: str | None = None,
    ) -> ThresholdDecision:
        ctx = self.surface(surface)
        hard = ctx.text.hard_block
        soft = ctx.text.soft_enforce
        level = "low"
        reasons: list[str] = []
        for label in ("hate", "selfharm"):
            value = scores.get(label, 0.0)
            if value >= hard.get(label, 1.0):
                reasons.append(f"{label}_hard")
                level = "high"
        if reasons:
            return ThresholdDecision(status="blocked", suggested_action="remove", reasons=tuple(reasons), level=level)
        for label in ("toxicity", "harassment"):
            value = scores.get(label, 0.0)
            if value >= soft.get(label, 1.0):
                reasons.append(f"{label}_soft")
                level = "medium"
        if reasons:
            return ThresholdDecision(status="needs_review", suggested_action="tombstone", reasons=tuple(reasons), level=level)
        reasons.append("clean")
        return ThresholdDecision(status="clean", suggested_action="none", reasons=tuple(reasons), level=level)

    # --- URL -------------------------------------------------------------

    def evaluate_url(self, verdict: str) -> ThresholdDecision:
        verdict = verdict.lower()
        if verdict == "malicious":
            return ThresholdDecision(status="blocked", suggested_action=self.url.malicious, reasons=("url_malicious",), level="high")
        if verdict == "suspicious":
            return ThresholdDecision(status="needs_review", suggested_action=self.url.suspicious, reasons=("url_suspicious",), level="medium")
        return ThresholdDecision(status="clean", suggested_action="none", reasons=("url_clean",), level="low")

    # --- Serialization ---------------------------------------------------

    @staticmethod
    def from_mapping(config: Mapping[str, Any]) -> "ModerationThresholds":
        base = ModerationThresholds.default()
        text_cfg = config.get("text", {})
        image_cfg = config.get("image", {})
        url_cfg = config.get("url", {})
        surfaces_cfg = config.get("surfaces", {})
        sampling_cfg = config.get("sampling", base.sampling)
        thresholds = ModerationThresholds(
            text=TextThresholdConfig(
                hard_block=dict(text_cfg.get("hard_block", base.text.hard_block)),
                soft_enforce=dict(text_cfg.get("soft_enforce", base.text.soft_enforce)),
            ),
            image=ImageThresholdConfig(
                hard_block=dict(image_cfg.get("hard_block", base.image.hard_block)),
                soft_review=dict(image_cfg.get("soft_review", base.image.soft_review)),
            ),
            url=UrlThresholdConfig(
                malicious=str(url_cfg.get("malicious", base.url.malicious)),
                suspicious=str(url_cfg.get("suspicious", base.url.suspicious)),
            ),
            surfaces={},
            sampling=dict(sampling_cfg),
        )
        surfaces: dict[str, ModerationThresholds] = {}
        for name, surface_cfg in surfaces_cfg.items():
            if not isinstance(surface_cfg, Mapping):
                continue
            surfaces[name] = ModerationThresholds.from_mapping(surface_cfg)
        object.__setattr__(thresholds, "surfaces", surfaces)
        return thresholds


def load_thresholds(path: str | Path) -> ModerationThresholds:
    """Load thresholds from a YAML (or JSON) file."""

    try:
        text = Path(path).read_text(encoding="utf-8")
    except FileNotFoundError:
        logger.warning("moderation thresholds file missing at %s; using defaults", path)
        return ModerationThresholds.default()
    data = _parse_config(text)
    if not isinstance(data, Mapping):
        logger.warning("moderation thresholds file invalid; falling back to defaults")
        return ModerationThresholds.default()
    return ModerationThresholds.from_mapping(data)


def _parse_config(raw: str) -> Any:
    try:
        import yaml  # type: ignore

        return yaml.safe_load(raw)
    except ModuleNotFoundError:  # pragma: no cover - fallback when PyYAML absent
        logger.debug("PyYAML not available; using minimal parser for moderation config")
    except Exception as exc:  # pragma: no cover - invalid YAML falls back to JSON/minimal
        logger.warning("failed to parse moderation YAML: %s", exc)
    try:
        return json.loads(raw)
    except json.JSONDecodeError:
        return _minimal_yaml(raw)


def _minimal_yaml(raw: str) -> dict[str, Any]:
    root: dict[str, Any] = {}
    stack: list[tuple[int, dict[str, Any]]] = [(-1, root)]
    for line in raw.splitlines():
        stripped = line.split("#", 1)[0].rstrip()
        if not stripped:
            continue
        indent = len(line) - len(line.lstrip(" "))
        while stack and indent <= stack[-1][0]:
            stack.pop()
        parent = stack[-1][1] if stack else root
        if ":" not in stripped:
            continue
        key, value = stripped.split(":", 1)
        key = key.strip()
        value = value.strip()
        if not value:
            node: dict[str, Any] = {}
            parent[key] = node
            stack.append((indent, node))
            continue
        parent[key] = _convert_value(value)
    return root


def _convert_value(value: str) -> Any:
    lowered = value.lower()
    if lowered in {"true", "false"}:
        return lowered == "true"
    if lowered in {"null", "none"}:
        return None
    try:
        if "." in value:
            return float(value)
        return int(value)
    except ValueError:
        return value.strip('"')
