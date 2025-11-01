from __future__ import annotations

from pathlib import Path
from typing import AsyncIterator, Iterator
from uuid import uuid4

import asyncpg
import pytest
import pytest_asyncio

from app.communities.domain import repo as repo_module
from app.communities.services.feed_writer import FeedWriter
from app.infra.redis import redis_client
from app.infra import postgres

pytestmark = pytest.mark.asyncio

REPO_ROOT = Path(__file__).resolve().parents[3]

MIGRATIONS_DIRS = [
    REPO_ROOT / "docs/parts/03-communities/backend/phase-1-groups-posts-core/migrations",
    REPO_ROOT / "docs/parts/03-communities/backend/phase-2-feeds-ranking/migrations",
]


@pytest.fixture(scope="module")
def postgres_container() -> Iterator["PostgresContainer"]:
    testcontainers = pytest.importorskip(
        "testcontainers.postgres",
        reason="testcontainers.postgres is required for integration tests",
    )
    PostgresContainer = testcontainers.PostgresContainer
    container = PostgresContainer("postgres:16-alpine")
    try:
        container.start()
    except Exception as exc:  # pragma: no cover - environment without docker
        pytest.skip(f"unable to start postgres container: {exc}")
    try:
        yield container
    finally:
        container.stop()


async def _run_migrations(pool: asyncpg.Pool) -> None:
    async with pool.acquire() as conn:
        await conn.execute("DROP SCHEMA IF EXISTS public CASCADE")
        await conn.execute("CREATE SCHEMA public")
        await conn.execute("GRANT ALL ON SCHEMA public TO PUBLIC")
        for directory in MIGRATIONS_DIRS:
            for path in sorted(directory.glob("*.sql")):
                sql = path.read_text(encoding="utf-8")
                await conn.execute(sql)


@pytest_asyncio.fixture(scope="function")
async def postgres_pool(postgres_container) -> AsyncIterator[asyncpg.Pool]:
    url = postgres_container.get_connection_url().replace("postgresql+psycopg2", "postgresql")
    pool = await asyncpg.create_pool(dsn=url, min_size=1, max_size=4)
    await _run_migrations(pool)
    postgres.set_pool(pool)
    try:
        yield pool
    finally:
        postgres.set_pool(None)
        await pool.close()


@pytest.mark.integration
async def test_post_keyset_pagination(postgres_pool):
    repo = repo_module.CommunitiesRepository()
    group = await repo.create_group(
        name="Keyset", slug="keyset", description="", visibility="public", created_by=uuid4(), tags=[], campus_id=None,
        avatar_key=None, cover_key=None
    )
    author = uuid4()
    posts = []
    for idx in range(3):
        post = await repo.create_post(
            group_id=group.id,
            author_id=author,
            title=f"Post {idx}",
            body=f"Body {idx}",
            topic_tags=["tag"],
        )
        posts.append(post)
    first_page, cursor = await repo.list_posts(group.id, limit=2)
    assert len(first_page) == 2
    assert cursor is not None
    second_page, _ = await repo.list_posts(group.id, limit=2, after=repo_module.decode_cursor(cursor))
    remaining_ids = {post.id for post in posts} - {post.id for post in first_page}
    assert {post.id for post in second_page} == remaining_ids


@pytest.mark.integration
async def test_reaction_counters(postgres_pool):
    repo = repo_module.CommunitiesRepository()
    group = await repo.create_group(
        name="Reactions",
        slug="reactions",
        description="",
        visibility="public",
        created_by=uuid4(),
        tags=[],
        campus_id=None,
        avatar_key=None,
        cover_key=None,
    )
    author = uuid4()
    post = await repo.create_post(
        group_id=group.id,
        author_id=author,
        title="Hello",
        body="Body",
        topic_tags=[],
    )
    user = uuid4()
    reaction = await repo.add_reaction(
        subject_type="post",
        subject_id=post.id,
        user_id=user,
        emoji="🔥",
    )
    assert reaction.emoji == "🔥"
    refreshed = await repo.get_post(post.id)
    assert refreshed and refreshed.reactions_count == 1
    await repo.remove_reaction(
        subject_type="post",
        subject_id=post.id,
        user_id=user,
        emoji="🔥",
    )
    refreshed_again = await repo.get_post(post.id)
    assert refreshed_again and refreshed_again.reactions_count == 0


@pytest.mark.integration
async def test_feed_fanout_inserts(postgres_pool):
    repo = repo_module.CommunitiesRepository()
    group = await repo.create_group(
        name="Feed",
        slug="feed",
        description="",
        visibility="public",
        created_by=uuid4(),
        tags=[],
        campus_id=None,
        avatar_key=None,
        cover_key=None,
    )
    member_id = uuid4()
    await repo.upsert_member(group.id, member_id, role="member")
    recipients = set(await repo.list_member_ids(group.id))
    post = await repo.create_post(
        group_id=group.id,
        author_id=member_id,
        title="Ranked",
        body="Body",
        topic_tags=[],
    )
    writer = FeedWriter(repository=repo)
    inserted = await writer.fanout_post(post)
    assert inserted == len(recipients)
    entries, _ = await repo.list_user_feed_entries(member_id, limit=5)
    assert entries and entries[0].post_id == post.id
    cache_key = f"feed:{member_id}"
    cache_items = await redis_client.zrange(cache_key, 0, -1, withscores=True)
    assert cache_items and cache_items[0][0] == str(post.id)
