"""Feed query helpers for communities APIs."""

from __future__ import annotations

from base64 import b64decode, b64encode
from typing import Sequence
from uuid import UUID

from app.communities.domain import models, repo
from app.communities.infra import redis as feed_cache
from app.communities.services import ranker


def encode_cursor(rank_score: float, post_id: UUID) -> str:
    payload = f"{rank_score}:{post_id}"
    return b64encode(payload.encode()).decode()


def decode_cursor(cursor: str) -> tuple[float, UUID]:
    score_str, post_str = b64decode(cursor.encode()).decode().split(":", maxsplit=1)
    return float(score_str), UUID(post_str)


class FeedQueryService:
    """Resolves user and group feeds using Redis caches and Postgres fallbacks."""

    def __init__(self, repository: repo.CommunitiesRepository | None = None) -> None:
        self.repo = repository or repo.CommunitiesRepository()

    async def get_user_feed(
        self,
        owner_id: UUID,
        *,
        limit: int,
        after: str | None = None,
    ) -> tuple[list[models.FeedEntry], str | None]:
        after_tuple = decode_cursor(after) if after else None
        entries: list[models.FeedEntry] = []
        remaining = limit
        next_cursor: str | None = None

        cache_candidates = await feed_cache.fetch_feed_candidates(owner_id, limit=limit, after=after_tuple)
        cache_entries: list[tuple[models.FeedEntry, float]] = []
        if cache_candidates:
            cache_entries = await self._hydrate_owner_entries(owner_id, cache_candidates)
            for entry, score in cache_entries:
                entry.rank_score = score
                entries.append(entry)
            if entries:
                remaining = max(limit - len(entries), 0)
                last_entry = entries[-1]
                last_score = cache_entries[min(len(entries), len(cache_entries)) - 1][1]
                after_tuple = (last_score, last_entry.post_id)
                if remaining == 0:
                    next_cursor = encode_cursor(last_score, last_entry.post_id)
                    return entries[:limit], next_cursor

        db_entries, db_cursor = await self.repo.list_user_feed_entries(
            owner_id,
            limit=remaining,
            after=after_tuple if after_tuple else None,
        )
        entries.extend(db_entries)
        if db_cursor:
            next_cursor = encode_cursor(db_cursor[0], db_cursor[1])
        elif cache_candidates and cache_entries and len(cache_entries) >= limit:
            last_entry = cache_entries[limit - 1][0]
            last_score = cache_entries[limit - 1][1]
            next_cursor = encode_cursor(last_score, last_entry.post_id)
        return entries[:limit], next_cursor

    async def get_group_feed(
        self,
        group: models.Group,
        *,
        limit: int,
        after: str | None = None,
    ) -> tuple[list[models.Post], str | None]:
        posts = await self.repo.list_recent_posts_for_group(group.id, limit=limit + 10)
        scored = [(post, ranker.compute_rank(post)) for post in posts]
        scored.sort(key=lambda item: (item[1], item[0].created_at, item[0].id), reverse=True)
        if after:
            cursor_score, cursor_post = decode_cursor(after)
            skip_index = 0
            for idx, (post, score) in enumerate(scored):
                if post.id == cursor_post and abs(score - cursor_score) < 1e-6:
                    skip_index = idx + 1
                    break
            scored = scored[skip_index:]
        limited = scored[:limit]
        next_cursor = None
        if len(scored) > limit:
            next_post, next_score = scored[limit]
            next_cursor = encode_cursor(next_score, next_post.id)
        return [post for post, _ in limited], next_cursor

    async def _hydrate_owner_entries(
        self,
        owner_id: UUID,
        candidates: Sequence[tuple[UUID, float]],
    ) -> list[tuple[models.FeedEntry, float]]:
        post_ids = [post_id for post_id, _ in candidates]
        records = await self.repo.fetch_feed_entries_by_posts(owner_id, post_ids)
        record_map = {entry.post_id: entry for entry in records}
        ordered: list[tuple[models.FeedEntry, float]] = []
        for post_id, score in candidates:
            entry = record_map.get(post_id)
            if entry is None:
                continue
            ordered.append((entry, score))
        return ordered


__all__ = ["FeedQueryService", "encode_cursor", "decode_cursor"]
