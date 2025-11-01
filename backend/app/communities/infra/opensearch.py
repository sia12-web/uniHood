"""In-memory OpenSearch simulation used by tests and workers."""

from __future__ import annotations

import logging
from typing import Any, Iterable

_LOG = logging.getLogger(__name__)
_INDEX_STORAGE: dict[str, list[dict[str, Any]]] = {}
_INDEX_TEMPLATES: dict[str, dict[str, Any]] = {}
_PIPELINES: dict[str, dict[str, Any]] = {}


async def bulk_index(documents: Iterable[dict[str, Any]]) -> None:
	"""Simulate an OpenSearch bulk indexing call with in-memory storage."""

	batch = list(documents)
	if not batch:
		return
	for entry in batch:
		index = entry.get("index")
		payload = dict(entry.get("document") or {})
		if not index:
			continue
		_INDEX_STORAGE.setdefault(index, []).append(payload)
	_LOG.info("opensearch.bulk_index", extra={"count": len(batch)})


async def search(*, index: str, body: dict[str, Any]) -> dict[str, Any]:
	"""Perform a naive search through the in-memory index."""

	documents = _INDEX_STORAGE.get(index, [])
	query = body.get("query", {})
	filters = query.get("bool", {}).get("filter", [])

	def _matches_filters(document: dict[str, Any]) -> bool:
		for flt in filters:
			term = flt.get("term")
			if not term:
				continue
			key, value = next(iter(term.items()))
			if str(document.get(key)) != str(value):
				return False
		return True

	hits = []
	for doc in documents:
		if not _matches_filters(doc):
			continue
		if doc.get("deleted"):
			continue
		hits.append({"_id": doc.get("id"), "_score": 1.0, "_source": doc})
	limit = body.get("size") or 10
	return {"hits": {"hits": hits[:limit]}}


async def put_index_template(name: str, body: dict[str, Any]) -> None:
	"""Store index template metadata in memory."""

	_INDEX_TEMPLATES[name] = body
	_LOG.info("opensearch.put_index_template", extra={"name": name})


async def put_ingest_pipeline(name: str, body: dict[str, Any]) -> None:
	"""Store ingest pipeline definitions in memory."""

	_PIPELINES[name] = body
	_LOG.info("opensearch.put_ingest_pipeline", extra={"name": name})


def reset_state() -> None:
	"""Clear stored documents, templates, and pipelines (test helper)."""

	_INDEX_STORAGE.clear()
	_INDEX_TEMPLATES.clear()
	_PIPELINES.clear()


__all__ = ["bulk_index", "search", "put_index_template", "put_ingest_pipeline", "reset_state"]
