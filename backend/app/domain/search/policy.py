"""Rate limits and privacy guards for Search & Discovery."""

from __future__ import annotations

from dataclasses import dataclass

from app.domain.search import models
from app.infra.rate_limit import allow

SEARCH_PER_MINUTE = 60
DISCOVERY_PER_MINUTE = 60
MIN_QUERY_LEN = 2


@dataclass(slots=True)
class SearchPolicyError(Exception):
	detail: str
	status_code: int = 400

	def __str__(self) -> str:  # pragma: no cover - debugging aid
		return self.detail


class SearchRateLimitError(SearchPolicyError):
	def __init__(self) -> None:
		super().__init__(detail="rate_limit", status_code=429)


async def enforce_rate_limit(user_id: str, *, kind: str = "search", limit: int = SEARCH_PER_MINUTE) -> None:
	"""Ensure the caller remains within the configured budget."""

	allowed = await allow(kind, user_id, limit=limit)
	if not allowed:
		raise SearchRateLimitError()


def allow_user_search(candidate: models.UserCandidate, *, exact_query: bool) -> bool:
	"""Visibility guard for direct search requests."""

	if candidate.blocked:
		return False
	visibility = (candidate.visibility or "everyone").lower()
	if candidate.ghost_mode and not (candidate.is_friend and exact_query):
		return False
	if visibility == "none":
		return candidate.is_friend and exact_query
	if visibility == "friends":
		return candidate.is_friend
	return True


def allow_people_discovery(candidate: models.UserCandidate) -> bool:
	"""Visibility guard for the people discovery feed."""

	if candidate.blocked:
		return False
	if candidate.ghost_mode:
		return False
	visibility = (candidate.visibility or "everyone").lower()
	if visibility == "none":
		return False
	if visibility == "friends":
		return candidate.is_friend or candidate.mutual_count > 0
	return True


def allow_room_discovery(visibility: str) -> bool:
	"""Only rooms with link visibility participate in discovery."""

	return (visibility or "link").lower() == "link"
