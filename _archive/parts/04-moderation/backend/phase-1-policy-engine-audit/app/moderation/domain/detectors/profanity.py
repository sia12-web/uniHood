"""Simple profanity detector used for phase 1 moderation."""

from __future__ import annotations

import re
from typing import Iterable, Mapping


SANITIZE_RE = re.compile(r"[^a-z0-9]+")
LEET_REPLACEMENTS: Mapping[str, str] = {
    "4": "a",
    "@": "a",
    "1": "l",
    "3": "e",
    "0": "o",
    "$": "s",
    "7": "t",
}

BASELINE_PROFANITY: Mapping[str, str] = {
    "foo": "low",
    "bar": "medium",
    "baz": "high",
}


class ProfanityDetector:
    """Detects textual profanity using a deterministic lookup."""

    def __init__(self, lexicon: Mapping[str, str] | None = None) -> None:
        self.lexicon = dict(BASELINE_PROFANITY)
        if lexicon:
            self.lexicon.update({self._normalize(word): level for word, level in lexicon.items()})

    def evaluate(self, text: str) -> str:
        token_levels = [self._lookup(token) for token in self._tokenize(text)]
        if not token_levels:
            return "unknown"
        severity = max((level or "unknown" for level in token_levels), key=_rank)
        return severity

    def _lookup(self, token: str) -> str:
        normalized = self._normalize(token)
        return self.lexicon.get(normalized, "unknown")

    def _tokenize(self, text: str) -> Iterable[str]:
        if not text:
            return []
        sanitized = text.lower()
        for src, dest in LEET_REPLACEMENTS.items():
            sanitized = sanitized.replace(src, dest)
        return SANITIZE_RE.split(sanitized)

    def _normalize(self, token: str) -> str:
        return SANITIZE_RE.sub("", token.lower())


def _rank(level: str) -> int:
    order = {"unknown": 0, "low": 1, "medium": 2, "high": 3}
    return order.get(level, 0)
