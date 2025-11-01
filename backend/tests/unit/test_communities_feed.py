from __future__ import annotations

from datetime import datetime, timedelta, timezone
from uuid import UUID, uuid4

import pytest

from app.communities.domain import models
from app.communities.services import feed_query, ranker
from app.communities.services.feed_writer import FeedWriter
from app.infra.redis import redis_client


def _make_post(*, created_at: datetime | None = None, reactions: int = 0, comments: int = 0, is_pinned: bool = False) -> models.Post:
    created = created_at or datetime.now(timezone.utc)
    post_id = uuid4()
    return models.Post(
        id=post_id,
        group_id=uuid4(),
        author_id=uuid4(),
        title="",
        body="Body",
        topic_tags=[],
        media_count=0,
        reactions_count=reactions,
        comments_count=comments,
        is_pinned=is_pinned,
        created_at=created,
        updated_at=created,
        deleted_at=None,
    )


def test_compute_rank_monotonic_decay():
    base = datetime.now(timezone.utc)
    recent = _make_post(created_at=base - timedelta(minutes=5))
    older = _make_post(created_at=base - timedelta(hours=3))
    assert ranker.compute_rank(recent, now=base) > ranker.compute_rank(older, now=base)


def test_compute_rank_pin_boost():
    base = datetime.now(timezone.utc)
    regular = _make_post(created_at=base - timedelta(minutes=10))
    pinned = _make_post(created_at=base - timedelta(minutes=10), is_pinned=True)
    assert ranker.compute_rank(pinned, now=base) > ranker.compute_rank(regular, now=base)


def test_cursor_roundtrip():
    post_id = uuid4()
    cursor = feed_query.encode_cursor(1.234, post_id)
    score, decoded = feed_query.decode_cursor(cursor)
    assert decoded == post_id
    assert score == pytest.approx(1.234)


class _StubFeedRepo:
    def __init__(self) -> None:
        self.members = []
        self.entries: list[tuple[UUID, UUID, UUID, float]] = []

    async def list_member_ids(self, group_id: UUID) -> list[UUID]:
        return self.members

    async def bulk_upsert_feed_entries(self, entries):
        self.entries.extend(entries)

    async def mark_feed_entries_deleted(self, post_id: UUID) -> int:  # pragma: no cover - not used here
        return 0

    async def list_feed_owner_ids_for_post(self, post_id: UUID):  # pragma: no cover - not used here
        return []


@pytest.mark.asyncio
async def test_feed_writer_fanout_writes_cache():
    repo = _StubFeedRepo()
    owner = uuid4()
    repo.members = [owner]
    post = _make_post()
    writer = FeedWriter(repository=repo)

    inserted = await writer.fanout_post(post)

    assert inserted == 1
    assert repo.entries and repo.entries[0][0] == owner
    cache_key = f"feed:{owner}"
    cached = await redis_client.zrange(cache_key, 0, -1, withscores=True)
    assert cached and cached[0][0] == str(post.id)


class _StubQueryRepo:
    def __init__(self, owner_id: UUID, entry: models.FeedEntry) -> None:
        self.owner_id = owner_id
        self.entry = entry

    async def fetch_feed_entries_by_posts(self, owner_id: UUID, post_ids):
        if owner_id == self.owner_id and self.entry.post_id in post_ids:
            return [self.entry]
        return []

    async def list_user_feed_entries(self, owner_id: UUID, *, limit: int, after=None):
        return [], None


@pytest.mark.asyncio
async def test_feed_query_returns_cached_entries():
    owner_id = uuid4()
    post = _make_post()
    entry = models.FeedEntry(
        id=1,
        owner_id=owner_id,
        post_id=post.id,
        group_id=post.group_id,
        rank_score=1.0,
        created_at=post.created_at,
        inserted_at=post.created_at,
        deleted_at=None,
    )
    repo = _StubQueryRepo(owner_id, entry)
    service = feed_query.FeedQueryService(repository=repo)  # type: ignore[arg-type]
    key = f"feed:{owner_id}"
    await redis_client.zadd(key, {str(post.id): 1.0})

    entries, cursor = await service.get_user_feed(owner_id, limit=1)

    assert entries and entries[0].post_id == post.id
    assert cursor is not None