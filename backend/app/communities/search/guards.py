"""Validation helpers for communities search inputs."""

from __future__ import annotations

from app.communities.search import exceptions
from app.infra.rate_limit import allow

MIN_QUERY_LENGTH = 2
MAX_QUERY_LENGTH = 120
DEFAULT_RATE_LIMIT = 30


def normalize_query(value: str | None) -> str:
	"""Collapse whitespace and trim surrounding spaces."""

	if not value:
		return ""
	return " ".join(value.strip().split())


def ensure_query_allowed(query: str) -> str:
	"""Validate query length and content."""

	length = len(query)
	if length < MIN_QUERY_LENGTH:
		raise exceptions.QueryValidationError("query_too_short")
	if length > MAX_QUERY_LENGTH:
		raise exceptions.QueryValidationError("query_too_long")
	return query


async def enforce_rate_limit(user_id: str, *, kind: str = "communities:search", limit: int = DEFAULT_RATE_LIMIT) -> None:
	"""Apply a Redis-backed rate limit for search requests."""

	allowed = await allow(kind, user_id, limit=limit)
	if not allowed:
		raise exceptions.RateLimitError()
