import asyncio
import sys
from pathlib import Path

import pytest
import pytest_asyncio
from httpx import ASGITransport, AsyncClient
from fakeredis.aioredis import FakeRedis

# Ensure backend package is importable when tests run from repo root
BACKEND_ROOT = Path(__file__).resolve().parents[1]
if str(BACKEND_ROOT) not in sys.path:
	sys.path.insert(0, str(BACKEND_ROOT))

from app.domain.proximity import live_sessions
from app.infra import postgres
from app.main import app
from app.settings import settings


# Ensure a selector-based event loop policy on Windows to avoid Proactor issues with async IO
if hasattr(asyncio, "WindowsSelectorEventLoopPolicy"):
	try:
		asyncio.set_event_loop_policy(asyncio.WindowsSelectorEventLoopPolicy())
	except Exception:
		# Non-fatal; proceed with default policy
		pass


@pytest_asyncio.fixture(autouse=True)
async def fake_redis():
	from app.infra.redis import redis_client, set_redis_client
	original = redis_client
	client = FakeRedis(decode_responses=True)
	set_redis_client(client)
	try:
		yield client
	finally:
		await live_sessions.shutdown()
		set_redis_client(original)
		await client.flushall()


@pytest.fixture(autouse=True)
def patch_postgres(monkeypatch):
	async def _noop():
		return None

	monkeypatch.setattr(postgres, "init_pool", _noop)
	monkeypatch.setattr(postgres, "close_pool", _noop)


@pytest.fixture(autouse=True)
def force_test_settings():
	"""Ensure a consistent test environment.

	Most API tests authenticate via X-User-Id/X-Campus-Id headers, which are only
	accepted in dev mode.
	"""
	original_env = settings.environment
	original_intent_required = settings.intent_signing_required
	settings.environment = "dev"
	settings.intent_signing_required = False
	try:
		yield
	finally:
		settings.environment = original_env
		settings.intent_signing_required = original_intent_required


@pytest_asyncio.fixture
async def api_client():
	transport = ASGITransport(app=app)
	async with AsyncClient(transport=transport, base_url="http://testserver") as client:
		yield client
