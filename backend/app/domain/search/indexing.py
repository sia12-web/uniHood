"""Optional indexing adapters for alternative search backends."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Iterable, Optional

from app.domain.search import models
from app.settings import settings


@dataclass(slots=True)
class OpenSearchAdapter:
	"""Placeholder adapter documenting the intended API surface."""

	endpoint: Optional[str] = None

	async def ensure_index(self) -> None:  # pragma: no cover - stub
		raise NotImplementedError("OpenSearch backend not wired for MVP")

	async def index_users(self, users: Iterable[models.UserCandidate]) -> None:  # pragma: no cover - stub
		raise NotImplementedError("OpenSearch backend not wired for MVP")

	async def search_users(self, query: str, *, campus_id: str, limit: int) -> list[models.UserCandidate]:  # pragma: no cover - stub
		raise NotImplementedError("OpenSearch backend not wired for MVP")


def resolve_adapter() -> Optional[OpenSearchAdapter]:
	"""Return adapter instance when the feature flag enables OpenSearch."""

	if settings.search_backend.lower() != "os":
		return None
	return OpenSearchAdapter()
