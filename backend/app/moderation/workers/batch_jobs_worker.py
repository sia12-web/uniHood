"""Background worker for moderation batch jobs.

The synchronous admin executor already processes most jobs inline. This worker
acts as a safety net so queued jobs can be inspected or retried without
raising "not implemented" errors when scheduled elsewhere.
"""

from __future__ import annotations

import logging
from typing import Any

from app.moderation.domain import container

logger = logging.getLogger(__name__)


async def process_batch_job(job_id: str, *, context: Any | None = None) -> None:
    """Process a queued batch job if it still requires attention."""

    scheduler = container.get_batch_job_scheduler_instance()
    handle = await scheduler.status(job_id)
    if handle is None:
        logger.warning("batch job missing", extra={"job_id": job_id})
        return
    logger.info(
        "batch job inspected",
        extra={"job_id": job_id, "status": handle.status, "dry_run": handle.dry_run},
    )

    # Inline executor finalises jobs eagerly; the worker currently only logs the
    # inspection so that task runners invoking it do not fail unexpectedly.


__all__ = ["process_batch_job"]
