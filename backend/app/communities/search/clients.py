"""Client wrappers for interacting with OpenSearch."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Sequence

from app.communities.domain import models
from app.communities.infra import opensearch
from app.communities.search import builders, exceptions

_GROUP_INDEX = "communities-groups-v1"


@dataclass(slots=True)
class GroupSearchHit:
	"""Normalized representation of a group search hit."""

	id: str
	name: str
	slug: str
	description: str | None
	tags: Sequence[str]
	score: float | None = None
	backend: str = "opensearch"

	def to_schema(self):
		from app.communities.schemas import dto

		return dto.GroupSearchResult(
			id=self.id,
			name=self.name,
			slug=self.slug,
			description=self.description,
			tags=list(self.tags),
			score=self.score,
			source=self.backend,
		)

	@classmethod
	def from_group(cls, group: models.Group, *, backend: str = "postgres") -> GroupSearchHit:
		return cls(
			id=str(group.id),
			name=group.name,
			slug=group.slug,
			description=group.description,
			tags=group.tags,
			score=None,
			backend=backend,
		)


class OpenSearchCommunitiesClient:
	"""Thin async wrapper around the opensearch transport module."""

	def __init__(self, *, transport: Any | None = None) -> None:
		self._transport = transport or opensearch

	async def search_groups(self, *, campus_id: str | None, query: str, limit: int) -> list[GroupSearchHit]:
		payload = builders.build_group_search_query(query=query, campus_id=campus_id, limit=limit)
		response = await self._execute_search(index=_GROUP_INDEX, body=payload)
		return self._parse_hits(response)

	async def typeahead_groups(self, *, campus_id: str | None, query: str, limit: int) -> list[GroupSearchHit]:
		payload = builders.build_group_typeahead_query(query=query, campus_id=campus_id, limit=limit)
		response = await self._execute_search(index=_GROUP_INDEX, body=payload)
		return self._parse_hits(response)

	async def _execute_search(self, *, index: str, body: dict[str, Any]) -> dict[str, Any]:
		try:
			return await self._transport.search(index=index, body=body)
		except Exception as exc:  # pragma: no cover - defensive guard
			raise exceptions.BackendError("search_unavailable") from exc

	def _parse_hits(self, response: dict[str, Any]) -> list[GroupSearchHit]:
		hits: list[GroupSearchHit] = []
		for hit in response.get("hits", {}).get("hits", []):
			source = hit.get("_source") or {}
			group_id = source.get("id") or hit.get("_id")
			if not group_id:
				continue
			hits.append(
				GroupSearchHit(
					id=str(group_id),
					name=source.get("name", ""),
					slug=source.get("slug", ""),
					description=source.get("description"),
					tags=list(source.get("tags") or []),
					score=float(hit.get("_score")) if hit.get("_score") is not None else None,
				)
			)
		return hits


__all__ = ["GroupSearchHit", "OpenSearchCommunitiesClient"]
