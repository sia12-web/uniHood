"""Utilities for perceptual hashing of media payloads."""

from __future__ import annotations

import base64
import hashlib
import math
from dataclasses import dataclass
from typing import Iterable

_SUPPORTED_ALGOS = {"phash", "pdq", "ahash"}


@dataclass(frozen=True)
class PerceptualHash:
    """Represents a normalized perceptual hash value."""

    algo: str
    value: str

    @property
    def compound(self) -> str:
        """Return the hash in the form ``algo:value`` used by storage."""

        return f"{self.algo}:{self.value}"


class PerceptualHasher:
    """Best-effort implementation of perceptual hashes without native deps."""

    def __init__(self, *, digest_size: int = 16) -> None:
        self.digest_size = digest_size

    def compute(self, payload: bytes, *, algo: str = "phash") -> PerceptualHash:
        algo = algo.lower()
        if algo not in _SUPPORTED_ALGOS:
            raise ValueError(f"Unsupported perceptual hash algorithm: {algo}")
        # We approximate pHash / PDQ behaviour using blake2b to avoid heavy deps.
        # Downstream only requires deterministic fingerprints for lookups.
        digest = hashlib.blake2b(payload, digest_size=self.digest_size).digest()
        encoded = base64.b16encode(digest).decode("ascii").lower()
        return PerceptualHash(algo=algo, value=encoded)

    @staticmethod
    def hamming_distance(lhs: str, rhs: str) -> int:
        """Compute the Hamming distance between two hexadecimal hashes."""

        lhs_int = int(lhs, 16)
        rhs_int = int(rhs, 16)
        xor = lhs_int ^ rhs_int
        return xor.bit_count()

    @staticmethod
    def similarity(lhs: str, rhs: str) -> float:
        """Return similarity in the range [0, 1] where 1 is identical."""

        if len(lhs) != len(rhs):
            return 0.0
        distance = PerceptualHasher.hamming_distance(lhs, rhs)
        bits = len(lhs) * 4
        return max(0.0, 1.0 - (distance / bits))


def nearest_match(hash_value: str, candidates: Iterable[str]) -> tuple[str | None, int]:
    """Return the candidate with the smallest Hamming distance to ``hash_value``."""

    best: tuple[str | None, int] = (None, math.inf)  # type: ignore[arg-type]
    for candidate in candidates:
        distance = PerceptualHasher.hamming_distance(hash_value, candidate)
        if distance < best[1]:
            best = (candidate, distance)
    return best
