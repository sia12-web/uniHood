"""Bootstrap utilities for provisioning OpenSearch assets."""

from __future__ import annotations

import json
import logging
from importlib import resources
from typing import Any, Dict

from app.communities.infra import opensearch

_LOG = logging.getLogger(__name__)
_INDEX_TEMPLATES: dict[str, str] = {
	"communities-groups-template": "index_templates/groups_v1.json",
	"communities-posts-template": "index_templates/posts_v1.json",
	"communities-events-template": "index_templates/events_v1.json",
}
_PIPELINES: dict[str, str] = {
	"communities-generic-v1": "pipelines/generic_v1.json",
}



def _load_resource(path: str) -> Dict[str, Any]:
	package = resources.files(__package__).joinpath("resources").joinpath(path)
	with resources.as_file(package) as file_path:
		return json.loads(file_path.read_text())



class SearchBootstrapper:
	"""Install index templates and ingest pipelines for communities search."""

	def __init__(self, *, transport: Any | None = None) -> None:
		self._transport = transport or opensearch

	async def install_all(self) -> None:
		for name, rel_path in _INDEX_TEMPLATES.items():
			payload = _load_resource(rel_path)
			await self._transport.put_index_template(name, payload)
			_LOG.info("search.bootstrap.template", extra={"template": name})
		for name, rel_path in _PIPELINES.items():
			payload = _load_resource(rel_path)
			await self._transport.put_ingest_pipeline(name, payload)
			_LOG.info("search.bootstrap.pipeline", extra={"pipeline": name})


__all__ = ["SearchBootstrapper"]
