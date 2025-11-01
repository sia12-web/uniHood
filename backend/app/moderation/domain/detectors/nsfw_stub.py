"""Placeholder NSFW detector used until model integration arrives."""

from __future__ import annotations


class NsfwStubDetector:
    """Always reports unknown, acting as a stub for future model output."""

    async def evaluate(self, media_keys: list[str] | None = None) -> str:
        return "unknown"
