"""Redis helpers for communities feed storage."""

from __future__ import annotations

from typing import Dict, Iterable, Sequence, Tuple
from uuid import UUID

from app.infra.redis import redis_client

_FEED_KEY = "feed:{owner_id}"
_REBUILD_QUEUE = "feed:rebuild"


def _feed_key(owner_id: UUID) -> str:
    return _FEED_KEY.format(owner_id=owner_id)


async def push_to_feeds(
    payload: Dict[UUID, Tuple[UUID, float]],
    *,
    max_length: int,
) -> None:
    if not payload:
        return
    pipe = redis_client.pipeline(transaction=False)
    for owner_id, (post_id, score) in payload.items():
        key = _feed_key(owner_id)
        pipe.zadd(key, {str(post_id): float(score)})
        pipe.zremrangebyrank(key, 0, -max_length - 1)
    await pipe.execute()


async def remove_post_from_feeds(post_id: UUID, owners: Iterable[UUID]) -> None:
    pipe = redis_client.pipeline(transaction=False)
    for owner_id in owners:
        pipe.zrem(_feed_key(owner_id), str(post_id))
    await pipe.execute()


async def fetch_feed_candidates(
    owner_id: UUID,
    *,
    limit: int,
    after: Tuple[float, UUID] | None,
) -> list[tuple[UUID, float]]:
    key = _feed_key(owner_id)
    exists = await redis_client.exists(key)
    if not exists:
        return []
    start_index = 0
    if after is not None:
        _, post_id = after
        rank = await redis_client.zrevrank(key, str(post_id))
        if rank is not None:
            start_index = rank + 1
    stop_index = start_index + limit - 1
    rows = await redis_client.zrevrange(key, start_index, stop_index, withscores=True)
    return [(UUID(member), float(score)) for member, score in rows]


async def replace_feed(
    owner_id: UUID,
    entries: Sequence[tuple[UUID, float]],
    *,
    max_length: int,
) -> None:
    key = _feed_key(owner_id)
    pipe = redis_client.pipeline(transaction=False)
    pipe.delete(key)
    if entries:
        mapping = {str(post_id): float(score) for post_id, score in entries[:max_length]}
        pipe.zadd(key, mapping)
    await pipe.execute()


async def rescore_post(post_id: UUID, owners: Sequence[UUID], score: float) -> None:
    if not owners:
        return
    pipe = redis_client.pipeline(transaction=False)
    for owner_id in owners:
        key = _feed_key(owner_id)
        pipe.zadd(key, {str(post_id): float(score)}, xx=True)
    await pipe.execute()


async def enqueue_rebuild(owner_id: UUID) -> None:
    await redis_client.rpush(_REBUILD_QUEUE, str(owner_id))


async def dequeue_rebuild(timeout: int = 1) -> UUID | None:
    item = await redis_client.blpop(_REBUILD_QUEUE, timeout=timeout)
    if not item:
        return None
    _, owner_str = item
    return UUID(owner_str)


__all__ = [
    "push_to_feeds",
    "remove_post_from_feeds",
    "fetch_feed_candidates",
    "replace_feed",
    "rescore_post",
    "enqueue_rebuild",
    "dequeue_rebuild",
]
