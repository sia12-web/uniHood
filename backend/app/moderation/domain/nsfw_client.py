"""Interfaces for NSFW classifiers used by media scanners."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Protocol


@dataclass(frozen=True)
class NsfwScore:
    """Probability scores returned by the NSFW classifier."""

    nsfw: float
    gore: float
    model_version: str | None = None


class NsfwClassifier(Protocol):
    """NSFW classifier interface for dependency injection."""

    async def score(self, payload: bytes, *, mime: str | None = None) -> NsfwScore:
        ...


class ZeroNsfwClassifier(NsfwClassifier):
    """Default stub that always returns a clean score."""

    async def score(self, payload: bytes, *, mime: str | None = None) -> NsfwScore:  # noqa: ARG002 - interface parity
        return NsfwScore(nsfw=0.0, gore=0.0, model_version="stub")
