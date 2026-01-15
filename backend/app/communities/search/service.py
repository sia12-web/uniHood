"""Service layer orchestrating communities search flows."""

from __future__ import annotations

import logging
import time
from typing import Awaitable, Callable, List, Tuple

from app.communities.domain import repo as repo_module
from app.communities.search import clients, exceptions, guards
from app.communities.schemas import dto
from app.infra.auth import AuthenticatedUser
from app.obs import metrics as obs_metrics
from app.settings import settings

_LOG = logging.getLogger(__name__)
_GROUP_KIND = "communities:groups"
_TYPEAHEAD_KIND = "communities:typeahead"


class SearchService:
	"""Coordinate guards, clients, and fallbacks for communities search."""

	def __init__(
		self,
		*,
		repository: repo_module.CommunitiesRepository | None = None,
		search_client: clients.OpenSearchCommunitiesClient | None = None,
		backend: str | None = None,
	) -> None:
		self._repo = repository or repo_module.CommunitiesRepository()
		self._client = search_client or clients.OpenSearchCommunitiesClient()
		self._backend = backend or settings.search_backend

	async def search_groups(
		self,
		auth_user: AuthenticatedUser,
		*,
		query: str,
		limit: int = 10,
	) -> dto.GroupSearchResponse:
		normalized = guards.normalize_query(query)
		normalized = guards.ensure_query_allowed(normalized)
		await guards.enforce_rate_limit(auth_user.id, kind=_GROUP_KIND)

		obs_metrics.SEARCH_QUERIES.labels(kind=_GROUP_KIND).inc()
		started = time.perf_counter()
		items, backend_used = await self._resolve_hits(
			lambda: self._client.search_groups(campus_id=auth_user.campus_id, query=normalized, limit=limit),
			auth_user=auth_user,
			query=normalized,
			limit=limit,
		)
		duration = time.perf_counter() - started
		obs_metrics.SEARCH_LATENCY.labels(kind=_GROUP_KIND).observe(duration)
		return dto.GroupSearchResponse(
			items=[hit.to_schema() for hit in items],
			backend=backend_used,
			took_ms=int(duration * 1000),
		)

	async def typeahead_groups(
		self,
		auth_user: AuthenticatedUser,
		*,
		query: str,
		limit: int = 5,
	) -> dto.GroupTypeaheadResponse:
		normalized = guards.normalize_query(query)
		normalized = guards.ensure_query_allowed(normalized)
		await guards.enforce_rate_limit(auth_user.id, kind=_TYPEAHEAD_KIND)

		obs_metrics.SEARCH_QUERIES.labels(kind=_TYPEAHEAD_KIND).inc()
		started = time.perf_counter()
		items, backend_used = await self._resolve_hits(
			lambda: self._client.typeahead_groups(campus_id=auth_user.campus_id, query=normalized, limit=limit),
			auth_user=auth_user,
			query=normalized,
			limit=limit,
		)
		duration = time.perf_counter() - started
		obs_metrics.SEARCH_LATENCY.labels(kind=_TYPEAHEAD_KIND).observe(duration)
		return dto.GroupTypeaheadResponse(
			items=[hit.to_schema() for hit in items],
			backend=backend_used,
			took_ms=int(duration * 1000),
		)

	async def _resolve_hits(
		self,
		client_call: Callable[[], Awaitable[List[clients.GroupSearchHit]]],
		*,
		auth_user: AuthenticatedUser,
		query: str,
		limit: int,
	) -> Tuple[list[clients.GroupSearchHit], str]:
		backend_hits: list[clients.GroupSearchHit] = []
		backend_label = "fallback"

		if self._backend.lower() == "opensearch":
			try:
				backend_hits = await client_call()
				backend_label = "opensearch" if backend_hits else "opensearch-empty"
			except exceptions.SearchError as exc:
				_LOG.warning("communities.search.backend_failure", extra={"detail": exc.detail})
			except Exception:  # pragma: no cover - defensive log
				_LOG.exception("communities.search.backend_exception")

		if backend_hits:
			return backend_hits, backend_label

		groups = await self._repo.search_groups_fallback(
			query=query,
			campus_id=auth_user.campus_id,
			limit=limit,
		)
		return [clients.GroupSearchHit.from_group(group) for group in groups], "postgres"


__all__ = ["SearchService"]
