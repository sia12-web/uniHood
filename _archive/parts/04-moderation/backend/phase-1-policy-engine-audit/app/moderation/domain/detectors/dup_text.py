"""Duplicate text detector using Redis-style storage semantics."""

from __future__ import annotations

import hashlib
import time
from dataclasses import dataclass
from typing import Protocol


class RollingStore(Protocol):
    """Minimal interface for storing hashes with TTL semantics."""

    async def add(self, key: str, value: str, ttl_seconds: int) -> None:
        ...

    async def count(self, key: str) -> int:
        ...


@dataclass
class DuplicateTextDetector:
    """Detects near duplicate text submissions from a single user."""

    store: RollingStore
    window_seconds: int = 300
    threshold: int = 3

    async def evaluate(self, user_id: str, text: str) -> bool:
        digest = hashlib.sha256(text.encode("utf-8")).hexdigest()
        key = f"dup:{user_id}:{int(time.time() // 30)}"
        await self.store.add(key, digest, ttl_seconds=self.window_seconds)
        total = await self.store.count(key)
        return total >= self.threshold
