import asyncio
from datetime import datetime, timezone
from uuid import uuid4

import pytest

from app.communities.domain import models
from app.communities.search import builders, guards
from app.communities.search import exceptions as search_exceptions
from app.communities.search.clients import GroupSearchHit
from app.communities.search.service import SearchService
from app.communities.workers.outbox_indexer import OutboxIndexer
from app.infra.auth import AuthenticatedUser
from app.communities.search.bootstrap import SearchBootstrapper


class _StubRepo:
	def __init__(self, groups):
		self.groups = groups
		self.calls = 0

	async def search_groups_fallback(self, *, query: str, campus_id: str | None, limit: int, conn=None):
		self.calls += 1
		return self.groups


class _StubClient:
	def __init__(self, hits):
		self.hits = hits
		self.calls = 0

	async def search_groups(self, *, campus_id: str | None, query: str, limit: int):
		self.calls += 1
		return list(self.hits)

	async def typeahead_groups(self, *, campus_id: str | None, query: str, limit: int):
		self.calls += 1
		return list(self.hits)


@pytest.mark.asyncio
async def test_search_service_uses_fallback(monkeypatch):
	group = models.Group.model_validate(
		{
			"id": uuid4(),
			"campus_id": uuid4(),
			"name": "Fallback Group",
			"slug": "fallback-group",
			"description": "Description",
			"visibility": "public",
			"avatar_key": None,
			"cover_key": None,
			"is_locked": False,
			"tags": ["study"],
			"created_by": uuid4(),
			"created_at": datetime.now(timezone.utc),
			"updated_at": datetime.now(timezone.utc),
			"deleted_at": None,
		}
	)
	repo = _StubRepo([group])
	client = _StubClient([])
	service = SearchService(repository=repo, search_client=client, backend="postgres")

	async def _no_rate(*args, **kwargs):
		return None

	monkeypatch.setattr(guards, "enforce_rate_limit", _no_rate)
	result = await service.search_groups(AuthenticatedUser(id="u1", campus_id="c1"), query="fallback", limit=5)

	assert result.backend == "postgres"
	assert repo.calls == 1
	assert client.calls == 0
	assert result.items[0].name == "Fallback Group"


@pytest.mark.asyncio
async def test_search_service_prefers_opensearch(monkeypatch):
	hit = GroupSearchHit(
		id="group-1",
		name="Indexed Club",
		slug="indexed-club",
		description="",
		tags=["clubs"],
		score=2.5,
	)
	repo = _StubRepo([])
	client = _StubClient([hit])
	service = SearchService(repository=repo, search_client=client, backend="opensearch")

	async def _no_rate(*args, **kwargs):
		return None

	monkeypatch.setattr(guards, "enforce_rate_limit", _no_rate)
	result = await service.search_groups(AuthenticatedUser(id="user", campus_id="campus"), query="indexed", limit=5)

	assert result.backend.startswith("opensearch")
	assert repo.calls == 0
	assert client.calls == 1
	assert result.items[0].source == "opensearch"


@pytest.mark.asyncio
async def test_typeahead_paths(monkeypatch):
	repo = _StubRepo([])
	client = _StubClient([])
	service = SearchService(repository=repo, search_client=client, backend="postgres")

	async def _no_rate(*args, **kwargs):
		return None

	monkeypatch.setattr(guards, "enforce_rate_limit", _no_rate)

	with pytest.raises(search_exceptions.QueryValidationError):
		await service.typeahead_groups(AuthenticatedUser(id="u1", campus_id="c1"), query=" ", limit=3)

	monkeypatch.setattr(guards, "enforce_rate_limit", _no_rate)
	group = models.Group.model_validate(
		{
			"id": uuid4(),
			"campus_id": uuid4(),
			"name": "Typeahead",
			"slug": "typeahead",
			"description": "type",
			"visibility": "public",
			"avatar_key": None,
			"cover_key": None,
			"is_locked": False,
			"tags": [],
			"created_by": uuid4(),
			"created_at": datetime.now(timezone.utc),
			"updated_at": datetime.now(timezone.utc),
			"deleted_at": None,
		}
	)
	repo.groups = [group]
	response = await service.typeahead_groups(AuthenticatedUser(id="u1", campus_id="c1"), query="type", limit=3)
	assert response.items[0].name == "Typeahead"


def test_builders_generate_expected_filters():
	query = builders.build_group_search_query(query="study", campus_id="campus", limit=7)
	assert query["size"] == 7
	filters = query["query"]["bool"]["filter"]
	assert {"term": {"campus_id": "campus"}} in filters

	typeahead_query = builders.build_group_typeahead_query(query="stu", campus_id=None, limit=3)
	assert typeahead_query["size"] == 3


def test_guards_normalize_and_validate():
	assert guards.normalize_query("  Hello   World  ") == "Hello World"
	with pytest.raises(search_exceptions.QueryValidationError):
		guards.ensure_query_allowed("a")


@pytest.mark.asyncio
async def test_bootstrap_installs(monkeypatch):
	recorded_templates = []
	recorded_pipelines = []

	class _StubTransport:
		async def put_index_template(self, name, body):
			recorded_templates.append((name, body))

		async def put_ingest_pipeline(self, name, body):
			recorded_pipelines.append((name, body))

	bootstrapper = SearchBootstrapper(transport=_StubTransport())
	await bootstrapper.install_all()

	assert recorded_templates
	assert recorded_pipelines


def test_outbox_indexer_formats_documents():
	event = models.OutboxEvent(
		id=1,
		aggregate_type="group",
		aggregate_id=uuid4(),
		event_type="group.created",
		payload={"name": "Club"},
		created_at=datetime.now(timezone.utc),
		processed_at=None,
	)
	worker = OutboxIndexer()
	formatted = list(worker._format_batch([event]))
	assert formatted[0]["index"] == "communities-groups-v1"
	assert formatted[0]["pipeline"] == "communities-generic-v1"
	assert formatted[0]["document"]["deleted"] is False
