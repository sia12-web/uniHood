"""Feed writer helpers for communities fan-out."""

from __future__ import annotations

import logging
from typing import Iterable, Sequence
from uuid import UUID

from app.communities.domain import models, repo
from app.communities.services import ranker
from app.communities.infra import redis as feed_cache
from app.obs import metrics as obs_metrics

_LOG = logging.getLogger(__name__)

_MAX_FEED_ITEMS = 5000


class FeedWriter:
    """Persists feed entries and maintains Redis caches."""

    def __init__(self, repository: repo.CommunitiesRepository | None = None) -> None:
        self.repo = repository or repo.CommunitiesRepository()

    async def fanout_post(self, post: models.Post) -> int:
        """Fan-out a post to all active members of its group."""

        member_ids = await self.repo.list_member_ids(post.group_id)
        if not member_ids:
            return 0

        rank_score = ranker.compute_rank(post)
        entries = [(member_id, post.id, post.group_id, rank_score) for member_id in member_ids]
        await self.repo.bulk_upsert_feed_entries(entries)

        await _write_to_cache(member_ids, post.id, rank_score)
        obs_metrics.FEED_FANOUT_EVENTS.inc()
        obs_metrics.FEED_ENTRIES_WRITTEN.inc(len(entries))
        return len(entries)

    async def remove_post(self, post_id: UUID) -> int:
        """Soft-delete feed entries and purge cache items for the given post."""

        owners = await self.repo.list_feed_owner_ids_for_post(post_id)
        if not owners:
            return 0
        removed = await self.repo.mark_feed_entries_deleted(post_id)
        await feed_cache.remove_post_from_feeds(post_id, owners)
        return removed

    async def rebuild_feed(self, owner_id: UUID, posts: Sequence[models.Post]) -> None:
        """Replace a user's feed with recomputed entries."""

        if not posts:
            await self.repo.delete_feed_entries_for_user(owner_id)
            await feed_cache.replace_feed(owner_id, [], max_length=_MAX_FEED_ITEMS)
            return

        scored_posts = [(post, ranker.compute_rank(post)) for post in posts]
        rank_pairs = [(owner_id, post.id, post.group_id, score) for post, score in scored_posts]
        await self.repo.delete_feed_entries_for_user(owner_id)
        await self.repo.bulk_upsert_feed_entries(rank_pairs)
        await feed_cache.replace_feed(
            owner_id,
            [(post.id, score) for post, score in scored_posts],
            max_length=_MAX_FEED_ITEMS,
        )

    async def rescore_post(self, post: models.Post) -> None:
        """Update rank scores for an existing post across all feeds."""

        rank_score = ranker.compute_rank(post)
        await self.repo.update_feed_rank_for_post(post.id, rank_score=rank_score)
        owners = await self.repo.list_feed_owner_ids_for_post(post.id)
        if not owners:
            return
        await feed_cache.rescore_post(post.id, owners, rank_score)


async def _write_to_cache(member_ids: Iterable[UUID], post_id: UUID, rank_score: float) -> None:
    payload = {member_id: (post_id, rank_score) for member_id in member_ids}
    try:
        await feed_cache.push_to_feeds(payload, max_length=_MAX_FEED_ITEMS)
    except Exception:  # pragma: no cover - logging safeguard
        obs_metrics.FEED_REDIS_ZADD_FAILURES.inc()
        _LOG.exception("feed_writer.cache_write_failed", extra={"post_id": str(post_id)})


__all__ = ["FeedWriter"]
