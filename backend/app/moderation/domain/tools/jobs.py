"""Job scheduling helpers for moderation admin tooling."""

from __future__ import annotations

import json
from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional
from uuid import UUID, uuid4

import asyncpg
from pydantic import BaseModel, Field

JobStatus = str


class JobHandle(BaseModel):
    """Lightweight job handle returned to API clients."""

    job_id: str
    status: JobStatus
    dry_run: bool = True
    metadata: Dict[str, Any] = Field(default_factory=dict)


@dataclass(slots=True)
class BatchJobScheduler:
    """Schedules and inspects moderation batch jobs.

    The scheduler stores job metadata in Postgres when a pool is provided,
    otherwise it falls back to an in-memory ledger (useful for unit tests).
    """

    pool: asyncpg.Pool | None = None
    _jobs: Dict[str, Dict[str, Any]] = field(default_factory=dict)
    _items: Dict[str, List[Dict[str, Any]]] = field(default_factory=dict)

    async def enqueue(
        self,
        *,
        job_type: str,
        params: Dict[str, Any],
        dry_run: bool,
        sample_size: int,
        actor_id: str,
    ) -> JobHandle:
        if not actor_id:
            raise ValueError("jobs.actor_required")
        if self.pool is None:
            job_id = str(uuid4())
            self._jobs[job_id] = {
                "job_type": job_type,
                "initiated_by": actor_id,
                "params": params,
                "dry_run": dry_run,
                "sample_size": sample_size,
                "status": "queued",
                "total": 0,
                "succeeded": 0,
                "failed": 0,
                "created_at": datetime.now(timezone.utc),
                "started_at": None,
                "finished_at": None,
            }
            self._items[job_id] = []
            return JobHandle(job_id=job_id, status="queued", dry_run=dry_run, metadata={"job_type": job_type})

        async with self.pool.acquire() as conn:
            record = await conn.fetchrow(
                """
                INSERT INTO mod_batch_job (job_type, initiated_by, params, dry_run, sample_size, status)
                VALUES ($1, $2::uuid, $3::jsonb, $4, $5, 'queued')
                RETURNING id, status, dry_run, params
                """,
                job_type,
                _ensure_uuid(actor_id),
                json.dumps(params),
                dry_run,
                sample_size,
            )
        assert record is not None
        job_id = str(record["id"])
        return JobHandle(
            job_id=job_id,
            status=str(record["status"]),
            dry_run=bool(record["dry_run"]),
            metadata={"job_type": job_type, "params": params},
        )

    async def mark_running(self, job_id: str) -> None:
        if self.pool is None:
            job = self._jobs.get(job_id)
            if job is None:
                raise KeyError(job_id)
            job["status"] = "running"
            job["started_at"] = datetime.now(timezone.utc)
            return
        async with self.pool.acquire() as conn:
            await conn.execute(
                """
                UPDATE mod_batch_job
                SET status = 'running', started_at = now()
                WHERE id = $1
                """,
                _ensure_uuid(job_id),
            )

    async def add_item(
        self,
        job_id: str,
        *,
        target_type: str,
        target_id: str,
        ok: Optional[bool],
        error: Optional[str],
        result: Optional[Dict[str, Any]],
    ) -> None:
        if self.pool is None:
            item = {
                "target_type": target_type,
                "target_id": target_id,
                "ok": ok,
                "error": error,
                "result": result,
            }
            self._items.setdefault(job_id, []).append(item)
            return
        async with self.pool.acquire() as conn:
            await conn.execute(
                """
                INSERT INTO mod_batch_job_item (job_id, target_type, target_id, ok, error, result)
                VALUES ($1, $2, $3, $4, $5, $6::jsonb)
                ON CONFLICT (job_id, target_type, target_id)
                DO UPDATE SET ok = EXCLUDED.ok, error = EXCLUDED.error, result = EXCLUDED.result
                """,
                _ensure_uuid(job_id),
                target_type,
                target_id,
                ok,
                error,
                json.dumps(result) if result is not None else None,
            )

    async def finalize(
        self,
        job_id: str,
        *,
        status: JobStatus,
        total: int,
        succeeded: int,
        failed: int,
        metadata: Optional[Dict[str, Any]] = None,
    ) -> None:
        if self.pool is None:
            job = self._jobs.get(job_id)
            if job is None:
                raise KeyError(job_id)
            job.update(
                {
                    "status": status,
                    "total": total,
                    "succeeded": succeeded,
                    "failed": failed,
                    "finished_at": datetime.now(timezone.utc),
                }
            )
            if metadata:
                job.setdefault("metadata", {}).update(metadata)
            return
        async with self.pool.acquire() as conn:
            await conn.execute(
                """
                UPDATE mod_batch_job
                SET status = $2,
                    total = $3,
                    succeeded = $4,
                    failed = $5,
                    finished_at = now(),
                    params = params || $6::jsonb
                WHERE id = $1
                """,
                _ensure_uuid(job_id),
                status,
                total,
                succeeded,
                failed,
                json.dumps(metadata or {}),
            )

    async def status(self, job_id: str) -> Optional[JobHandle]:
        if self.pool is None:
            job = self._jobs.get(job_id)
            if job is None:
                return None
            meta = dict(job.get("metadata", {}))
            meta.setdefault("job_type", job.get("job_type"))
            meta.setdefault("params", job.get("params"))
            return JobHandle(
                job_id=job_id,
                status=str(job.get("status", "queued")),
                dry_run=bool(job.get("dry_run", False)),
                metadata=meta,
            )
        async with self.pool.acquire() as conn:
            record = await conn.fetchrow(
                """
                SELECT id, status, dry_run, params
                FROM mod_batch_job
                WHERE id = $1
                """,
                _ensure_uuid(job_id),
            )
        if record is None:
            return None
        params = record.get("params") or {}
        if isinstance(params, str):
            try:
                params = json.loads(params)
            except json.JSONDecodeError:
                params = {"raw": params}
        return JobHandle(
            job_id=str(record["id"]),
            status=str(record["status"]),
            dry_run=bool(record["dry_run"]),
            metadata={"params": params},
        )


def get_batch_job_scheduler() -> BatchJobScheduler:
    """Dependency factory for scheduling jobs."""

    from app.moderation.domain import container as moderation_container

    return moderation_container.get_batch_job_scheduler_instance()


__all__ = ["BatchJobScheduler", "JobHandle", "get_batch_job_scheduler"]


def _ensure_uuid(value: str) -> UUID:
    if isinstance(value, UUID):
        return value
    try:
        return UUID(str(value))
    except (ValueError, TypeError) as exc:
        raise ValueError("invalid_uuid") from exc
