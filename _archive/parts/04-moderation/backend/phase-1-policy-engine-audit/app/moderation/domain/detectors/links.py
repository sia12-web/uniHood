"""Link safety detector covering denylist and link volume."""

from __future__ import annotations

import re
from typing import Iterable, Sequence


URL_RE = re.compile(r"https?://([a-z0-9.-]+)", re.IGNORECASE)


class LinkSafetyDetector:
    """Detects unsafe links based on a denylist and link count."""

    def __init__(self, denylist: Iterable[str] | None = None, max_links: int = 3) -> None:
        self.denylist = {domain.lower() for domain in (denylist or [])}
        self.max_links = max_links

    def evaluate(self, text: str) -> dict[str, bool | Sequence[str]]:
        domains = [match.group(1).lower() for match in URL_RE.finditer(text or "")]
        flagged = [domain for domain in domains if any(domain.endswith(item) for item in self.denylist)]
        excessive = len(domains) > self.max_links
        return {
            "unsafe_links": bool(flagged),
            "excessive_links": excessive,
            "flagged_domains": flagged,
        }
