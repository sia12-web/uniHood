"""Utilities for wiring moderation workers into an event loop."""

from __future__ import annotations

import asyncio
from typing import Iterable, Optional

from redis.asyncio import Redis

from app.moderation.domain.container import get_detectors, get_enforcer, get_policy, get_trust_ledger
from app.moderation.infra.redis import RedisStreamClient
from .ingress_worker import IngressWorker
from .actions_worker import ActionsWorker


async def _run_forever(worker, delay: float) -> None:
    while True:
        await worker.run_once()
        await asyncio.sleep(delay)


def spawn_workers(
    redis_client: Redis,
    *,
    ingress_stream: str = "mod:ingress",
    decisions_stream: str = "mod:decisions",
    poll_interval: float = 0.1,
    loop: Optional[asyncio.AbstractEventLoop] = None,
) -> Iterable[asyncio.Task]:
    """Create asyncio tasks for moderation ingress and actions workers.

    Returns the created tasks so callers can keep references for cancellation.
    """

    event_loop = loop or asyncio.get_event_loop()
    redis_stream = RedisStreamClient(redis_client)
    enforcer = get_enforcer()
    ingress = IngressWorker(
        redis=redis_stream,
        detectors=get_detectors(),
        policy=get_policy(),
        trust=get_trust_ledger(),
        enforcer=enforcer,
        stream_key=ingress_stream,
        decisions_stream=decisions_stream,
    )
    actions = ActionsWorker(redis=redis_stream, enforcer=enforcer, stream_key=decisions_stream)
    tasks = [
        event_loop.create_task(_run_forever(ingress, poll_interval), name="moderation-ingress"),
        event_loop.create_task(_run_forever(actions, poll_interval), name="moderation-actions"),
    ]
    return tasks
```}