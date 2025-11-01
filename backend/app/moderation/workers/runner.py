"""Utilities for wiring moderation workers into an event loop."""

from __future__ import annotations

import asyncio
from typing import Iterable, Optional

from redis.asyncio import Redis

from app.moderation.domain.container import get_case_service, get_detectors, get_enforcer, get_policy, get_trust_ledger
from app.moderation.infra.redis import RedisStreamClient
from app.moderation.workers.actions_worker import ActionsWorker
from app.moderation.workers.appeals_worker import AppealsWorker
from app.moderation.workers.escalation_worker import EscalationWorker
from app.moderation.workers.ingress_worker import IngressWorker
from app.moderation.workers.reports_worker import ReportsWorker
from app.moderation.infra.reporter_metrics import RedisReporterMetricsRepository


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
    """Create asyncio tasks for moderation ingress and actions workers."""

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
    reporter_metrics = RedisReporterMetricsRepository(redis_client)
    reports_worker = ReportsWorker(redis=redis_stream, repository=reporter_metrics)
    tasks.append(event_loop.create_task(_run_forever(reports_worker, poll_interval), name="moderation-reports"))

    case_service = get_case_service()
    notifications = getattr(case_service, "notifications", None)
    staff_ids = tuple(getattr(case_service, "staff_recipient_ids", ()))
    if notifications is not None:
        appeals_worker = AppealsWorker(
            redis=redis_stream,
            notifications=notifications,
            staff_recipient_ids=staff_ids,
        )
        escalations_worker = EscalationWorker(
            redis=redis_stream,
            notifications=notifications,
            staff_recipient_ids=staff_ids,
        )
        tasks.append(event_loop.create_task(_run_forever(appeals_worker, poll_interval), name="moderation-appeals"))
        tasks.append(event_loop.create_task(_run_forever(escalations_worker, poll_interval), name="moderation-escalations"))
    return tasks
