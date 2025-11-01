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

from app.infra import postgres
from app.infra.redis import redis_client, set_redis_client
from app.main import app


# Ensure a selector-based event loop policy on Windows to avoid Proactor issues with async IO
if hasattr(asyncio, "WindowsSelectorEventLoopPolicy"):
	try:
		asyncio.set_event_loop_policy(asyncio.WindowsSelectorEventLoopPolicy())
	except Exception:
		# Non-fatal; proceed with default policy
		pass


@pytest_asyncio.fixture(autouse=True)
async def fake_redis():
	original = redis_client
	client = FakeRedis(decode_responses=True)
	set_redis_client(client)
	try:
		yield client
	finally:
		set_redis_client(original)
		await client.flushall()


@pytest.fixture(autouse=True)
def patch_postgres(monkeypatch):
	async def _noop():
		return None

	monkeypatch.setattr(postgres, "init_pool", _noop)
	monkeypatch.setattr(postgres, "close_pool", _noop)


@pytest_asyncio.fixture
async def api_client():
	transport = ASGITransport(app=app)
	async with AsyncClient(transport=transport, base_url="http://testserver") as client:
		yield client
