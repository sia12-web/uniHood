"""OpenSearch query builders for communities search."""

from __future__ import annotations

from typing import Any

DEFAULT_GROUP_FIELDS = ["name^3", "description", "tags^2"]


def _base_bool_query(*, campus_id: str | None) -> dict[str, Any]:
	filters: list[dict[str, Any]] = []
	if campus_id:
		filters.append({"term": {"campus_id": campus_id}})
	filters.append({"term": {"deleted": False}})
	return {"filter": filters, "must": [], "should": []}


def build_group_search_query(*, query: str, campus_id: str | None, limit: int) -> dict[str, Any]:
	"""Return a relevance-oriented query for full text group search."""

	bool_query = _base_bool_query(campus_id=campus_id)
	bool_query["must"].append(
		{
			"multi_match": {
				"query": query,
				"fields": DEFAULT_GROUP_FIELDS,
				"type": "best_fields",
				"operator": "and",
			}
		}
	)
	bool_query["should"].extend(
		[
			{"match_phrase": {"name": {"query": query, "boost": 4}}},
			{"prefix": {"slug": query.lower()}},
		]
	)
	return {
		"size": limit,
		"query": {"bool": bool_query},
		"track_total_hits": False,
	}


def build_group_typeahead_query(*, query: str, campus_id: str | None, limit: int) -> dict[str, Any]:
	"""Return a lightweight prefix query for typeahead UX."""

	bool_query = _base_bool_query(campus_id=campus_id)
	bool_query["must"].append(
		{
			"bool": {
				"should": [
					{"match_phrase_prefix": {"name": {"query": query, "max_expansions": 20}}},
					{"prefix": {"slug": query.lower()}},
				],
				"minimum_should_match": 1,
			}
		}
	)
	return {
		"size": limit,
		"query": {"bool": bool_query},
	}
