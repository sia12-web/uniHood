"""Dashboard widgets for the moderation admin console."""

from __future__ import annotations

import hashlib
import json
import time
from datetime import datetime
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Query

from app.infra.auth import AuthenticatedUser, get_current_user
from app.infra.postgres import get_pool
from app.infra.rate_limit import allow
from app.moderation.domain.caching import DashboardCache
from app.moderation.domain.dashboard_queries import (
    fetch_kpis,
    fetch_moderator_performance,
    fetch_trends,
    fetch_workload,
)
from app.moderation.domain.rbac import StaffContext, resolve_staff_context, restrict_campuses
from app.obs import metrics as obs_metrics

router = APIRouter(prefix="/api/mod/v1/admin/dashboard", tags=["moderation-admin-dashboard"])

_DASHBOARD_RATE_KEY = "mod_admin_dashboard"
_DASHBOARD_RATE_LIMIT = 60
_DASHBOARD_RATE_WINDOW = 10
_CACHE_MIN_TTL = 15
_CACHE_MAX_TTL = 60
_cache = DashboardCache()


async def _ensure_rate(context: StaffContext, route: str) -> None:
    allowed = await allow(f"{_DASHBOARD_RATE_KEY}:{route}", context.actor_id, limit=_DASHBOARD_RATE_LIMIT, window_seconds=_DASHBOARD_RATE_WINDOW)
    if not allowed:
        raise HTTPException(status_code=429, detail="rate_limited")


async def _get_context(user: AuthenticatedUser = Depends(get_current_user)) -> StaffContext:
    return resolve_staff_context(user)


def _hash_key(prefix: str, payload: Any) -> str:
    raw = json.dumps(payload, sort_keys=True, separators=(",", ":")).encode("utf-8")
    digest = hashlib.sha1(raw).hexdigest()
    return f"{prefix}:{digest}"


@router.get("/kpis")
async def dashboard_kpis(
    campus_id: list[str] = Query(default_factory=list),
    context: StaffContext = Depends(_get_context),
) -> dict[str, Any]:
    await _ensure_rate(context, "kpis")
    campuses = restrict_campuses(context, campus_id or None)
    key = _hash_key("kpis", {"campus": campuses})
    start = time.perf_counter()

    async def _builder() -> dict[str, Any]:
        pool = await get_pool()
        async with pool.acquire() as conn:
            return await fetch_kpis(conn, campus_filter=campuses or None)

    data = await _cache.get_or_build(key, ttl=_CACHE_MIN_TTL, builder=_builder)
    elapsed_ms = (time.perf_counter() - start) * 1000.0
    obs_metrics.MOD_DASHBOARD_BUILD_MS.observe(elapsed_ms)
    obs_metrics.MOD_ADMIN_REQUESTS_TOTAL.labels(route="dashboard.kpis", status="200").inc()
    return data


@router.get("/trends")
async def dashboard_trends(
    campus_id: list[str] = Query(default_factory=list),
    start: datetime | None = Query(default=None),
    end: datetime | None = Query(default=None),
    bucket: str | None = Query(default=None, pattern=r"^(hour|day)$"),
    context: StaffContext = Depends(_get_context),
) -> list[dict[str, Any]]:
    await _ensure_rate(context, "trends")
    campuses = restrict_campuses(context, campus_id or None)
    bucket_value = bucket if bucket in {"hour", "day"} else None
    key = _hash_key("trends", {"campus": campuses, "start": start.isoformat() if start else None, "end": end.isoformat() if end else None, "bucket": bucket_value})
    ttl = min(max(_CACHE_MIN_TTL, 30), _CACHE_MAX_TTL)
    start_timer = time.perf_counter()

    async def _builder() -> list[dict[str, Any]]:
        pool = await get_pool()
        async with pool.acquire() as conn:
            return await fetch_trends(
                conn,
                campus_filter=campuses or None,
                start=start,
                end=end,
                bucket=bucket_value,
            )

    data = await _cache.get_or_build(key, ttl=ttl, builder=_builder)
    obs_metrics.MOD_DASHBOARD_BUILD_MS.observe((time.perf_counter() - start_timer) * 1000.0)
    obs_metrics.MOD_ADMIN_REQUESTS_TOTAL.labels(route="dashboard.trends", status="200").inc()
    return data


@router.get("/workload")
async def dashboard_workload(
    campus_id: list[str] = Query(default_factory=list),
    context: StaffContext = Depends(_get_context),
) -> dict[str, Any]:
    await _ensure_rate(context, "workload")
    campuses = restrict_campuses(context, campus_id or None)
    key = _hash_key("workload", {"campus": campuses})
    start = time.perf_counter()

    async def _builder() -> dict[str, Any]:
        pool = await get_pool()
        async with pool.acquire() as conn:
            return await fetch_workload(conn, campus_filter=campuses or None)

    data = await _cache.get_or_build(key, ttl=_CACHE_MIN_TTL, builder=_builder)
    obs_metrics.MOD_DASHBOARD_BUILD_MS.observe((time.perf_counter() - start) * 1000.0)
    obs_metrics.MOD_ADMIN_REQUESTS_TOTAL.labels(route="dashboard.workload", status="200").inc()
    return data


@router.get("/moderator_perf")
async def dashboard_moderator_performance(
    campus_id: list[str] = Query(default_factory=list),
    start: datetime | None = Query(default=None),
    end: datetime | None = Query(default=None),
    moderator_id: str | None = Query(default=None),
    context: StaffContext = Depends(_get_context),
) -> list[dict[str, Any]]:
    await _ensure_rate(context, "moderator_perf")
    campuses = restrict_campuses(context, campus_id or None)
    start_timer = time.perf_counter()
    pool = await get_pool()
    async with pool.acquire() as conn:
        data = await fetch_moderator_performance(
            conn,
            campus_filter=campuses or None,
            start=start,
            end=end,
            moderator_id=moderator_id,
        )
    obs_metrics.MOD_DASHBOARD_BUILD_MS.observe((time.perf_counter() - start_timer) * 1000.0)
    obs_metrics.MOD_ADMIN_REQUESTS_TOTAL.labels(route="dashboard.moderator_perf", status="200").inc()
    return data
