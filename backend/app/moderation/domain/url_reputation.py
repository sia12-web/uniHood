"""URL resolution and reputation heuristics for the moderation scanner."""

from __future__ import annotations

import asyncio
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from typing import Iterable, Mapping, Protocol
from urllib.parse import urlparse

import httpx

_SHORTENER_HOSTS = {"t.co", "bit.ly", "tinyurl.com", "rebrand.ly"}
_TRACKING_HINTS = {"utm_", "aff_id", "affiliate"}


@dataclass(frozen=True)
class UrlVerdict:
    """Resolved URL metadata and classification."""

    requested_url: str
    final_url: str | None
    etld_plus_one: str | None
    verdict: str
    lists: list[str]
    details: dict[str, str]
    resolved_at: datetime


class UrlReputationClient(Protocol):
    """Interface for URL reputation lookups."""

    async def classify(self, url: str) -> UrlVerdict:
        ...


def _etld_plus_one(host: str | None) -> str | None:
    if not host:
        return None
    parts = host.lower().split(".")
    if len(parts) < 2:
        return host.lower()
    return ".".join(parts[-2:])


@dataclass
class HeuristicUrlReputationClient(UrlReputationClient):
    """Resolver that uses httpx and basic deny-lists for classification."""

    http: httpx.AsyncClient
    malware_hosts: frozenset[str] = frozenset()
    phishing_hosts: frozenset[str] = frozenset()
    suspicious_hosts: frozenset[str] = frozenset()
    max_redirects: int = 5
    request_timeout: float = 2.0

    async def classify(self, url: str) -> UrlVerdict:
        lists: list[str] = []
        try:
            final_url = await self._resolve(url)
        except Exception:  # pragma: no cover - resilience fallback
            final_url = None
        etld1 = _etld_plus_one(urlparse(final_url or url).hostname)
        verdict = "unknown"
        if etld1:
            if etld1 in self.malware_hosts or etld1 in self.phishing_hosts:
                verdict = "malicious"
                if etld1 in self.malware_hosts:
                    lists.append("malware")
                if etld1 in self.phishing_hosts:
                    lists.append("phishing")
            elif etld1 in self.suspicious_hosts or etld1 in _SHORTENER_HOSTS:
                verdict = "suspicious"
                lists.append("shortener" if etld1 in _SHORTENER_HOSTS else "suspicious_host")
        details: dict[str, str] = {}
        if verdict == "unknown":
            details.update(self._heuristics(final_url or url))
            verdict = details.get("suggested_verdict", "clean")
            details.pop("suggested_verdict", None)
        return UrlVerdict(
            requested_url=url,
            final_url=final_url,
            etld_plus_one=etld1,
            verdict=verdict,
            lists=lists,
            details=details,
            resolved_at=datetime.now(timezone.utc),
        )

    async def _resolve(self, url: str) -> str | None:
        current_url = url
        for _ in range(self.max_redirects):
            try:
                response = await self.http.head(current_url, follow_redirects=False, timeout=self.request_timeout)
            except httpx.HTTPError:
                return current_url
            if response.is_redirect and response.headers.get("location"):
                target = response.headers["location"]
                if target.startswith("/"):
                    parts = urlparse(current_url)
                    current_url = f"{parts.scheme}://{parts.netloc}{target}"
                else:
                    current_url = target
                continue
            return current_url
        return current_url

    def _heuristics(self, url: str) -> dict[str, str]:
        parsed = urlparse(url)
        verdict = "clean"
        lists: list[str] = []
        queries = parsed.query.lower()
        host = parsed.hostname or ""
        if any(token in queries for token in _TRACKING_HINTS):
            lists.append("tracking")
        if host.endswith(".zip") or host.endswith(".ru"):
            lists.append("risky_tld")
            verdict = "suspicious"
        if parsed.scheme not in {"http", "https"}:
            verdict = "suspicious"
            lists.append("non_http")
        details: dict[str, str] = {}
        if lists:
            details["flags"] = ",".join(sorted(set(lists)))
        if verdict != "clean":
            details["suggested_verdict"] = verdict
        return details


class CachedUrlReputationClient(UrlReputationClient):
    """Cache wrapper that respects TTL before delegating to an inner client."""

    def __init__(self, inner: UrlReputationClient, *, ttl: timedelta = timedelta(hours=24)) -> None:
        self.inner = inner
        self.ttl = ttl
        self._cache: dict[str, UrlVerdict] = {}

    async def classify(self, url: str) -> UrlVerdict:
        now = datetime.now(timezone.utc)
        cached = self._cache.get(url)
        if cached and now - cached.resolved_at <= self.ttl:
            return cached
        verdict = await self.inner.classify(url)
        key = verdict.final_url or url
        self._cache[key] = verdict
        if verdict.final_url and verdict.final_url != key:
            self._cache[verdict.final_url] = verdict
        return verdict


async def warm_cache(client: UrlReputationClient, urls: Iterable[str]) -> None:
    """Helper to pre-populate caches in the background."""

    await asyncio.gather(*(client.classify(url) for url in urls))
