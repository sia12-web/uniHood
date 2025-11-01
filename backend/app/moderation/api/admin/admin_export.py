"""CSV exports for moderation staff."""

from __future__ import annotations

import csv
import io
from datetime import datetime
from typing import Any, Iterable

from fastapi import APIRouter, Depends, HTTPException, Query
from starlette.responses import StreamingResponse

from app.infra.auth import AuthenticatedUser, get_current_user
from app.infra.postgres import get_pool
from app.infra.rate_limit import allow
from app.moderation.domain.filters import CaseFilterSet, CaseQuery
from app.moderation.domain.rbac import StaffContext, resolve_staff_context, restrict_campuses
from app.obs import metrics as obs_metrics

router = APIRouter(prefix="/api/mod/v1/admin/cases", tags=["moderation-admin-export"])

_EXPORT_RATE_KEY = "mod_admin_export"
_EXPORT_LIMIT = 1
_EXPORT_WINDOW = 60
_EXPORT_MAX_ROWS = 50_000


async def _get_context(user: AuthenticatedUser = Depends(get_current_user)) -> StaffContext:
    return resolve_staff_context(user)


async def _enforce_export_rate(context: StaffContext) -> None:
    allowed = await allow(_EXPORT_RATE_KEY, context.actor_id, limit=_EXPORT_LIMIT, window_seconds=_EXPORT_WINDOW)
    if not allowed:
        raise HTTPException(status_code=429, detail="rate_limited")


def _assigned_filter(value: str | None, actor_id: str) -> tuple[str | None, bool]:
    if value == "me":
        return actor_id, False
    if value == "none":
        return None, True
    return value, False


def _row_to_csv(row: Any) -> list[str]:
    last_action = row["last_action"] or {}
    return [
        str(row["case_id"]),
        row["subject_type"],
        row["subject_id"],
        row["status"],
        str(row["severity"]),
        row["reason"],
        row["assigned_to"] or "",
        row["campus_id"] or "",
        row["created_at"].isoformat() if isinstance(row["created_at"], datetime) else str(row["created_at"]),
        row["updated_at"].isoformat() if isinstance(row["updated_at"], datetime) else str(row["updated_at"]),
        last_action.get("action", ""),
    ]


@router.get("/export.csv")
async def export_cases(
    *,
    status: str | None = Query(default=None),
    severity_min: int | None = Query(default=None, ge=0),
    severity_max: int | None = Query(default=None, ge=0),
    assigned_to: str | None = Query(default=None),
    subject_type: list[str] = Query(default_factory=list),
    campus_id: list[str] = Query(default_factory=list),
    reason: list[str] = Query(default_factory=list),
    appeal_open: bool | None = Query(default=None),
    created_from: datetime | None = Query(default=None),
    created_to: datetime | None = Query(default=None),
    q: str | None = Query(default=None),
    sort: str = Query(default="created_at"),
    order: str = Query(default="desc"),
    context: StaffContext = Depends(_get_context),
) -> StreamingResponse:
    await _enforce_export_rate(context)
    assigned_value, assigned_is_null = _assigned_filter(assigned_to, context.actor_id)
    campuses = restrict_campuses(context, campus_id or None)
    filters = CaseFilterSet(
        status=status,
        severity_min=severity_min,
        severity_max=severity_max,
        assigned_to=assigned_value,
        assigned_is_null=assigned_is_null,
        subject_types=tuple(subject_type),
        campus_ids=tuple(campuses),
        reasons=tuple(reason),
        appeal_open=appeal_open,
        created_from=created_from,
        created_to=created_to,
        search=q,
    )
    query = CaseQuery(filters=filters, sort_field=sort, order="asc" if order == "asc" else "desc", cursor=None, limit=_EXPORT_MAX_ROWS)
    params: list[Any] = []
    where_sql = query.build_where(params)
    order_clause = query.order_by()
    limit_value = min(query.limit, _EXPORT_MAX_ROWS)
    where_clause = f"WHERE {where_sql}" if where_sql else ""
    sql = f"""
        SELECT c.id AS case_id,
               c.subject_type,
               c.subject_id,
               c.status,
               c.severity,
               c.reason,
               c.assigned_to,
               CAST(c.campus_id AS text) AS campus_id,
               c.created_at,
               c.updated_at,
               c.appeal_open,
               c.escalation_level,
               (
                   SELECT jsonb_build_object('action', ma.action, 'created_at', ma.created_at, 'actor_id', ma.actor_id)
                   FROM mod_action ma
                   WHERE ma.case_id = c.id
                   ORDER BY ma.created_at DESC
                   LIMIT 1
               ) AS last_action
        FROM mod_case c
        {where_clause}
        ORDER BY {order_clause}
        LIMIT {limit_value}
    """
    pool = await get_pool()
    async with pool.acquire() as conn:
        rows = await conn.fetch(sql, *params)
    if len(rows) >= _EXPORT_MAX_ROWS:
        obs_metrics.MOD_CSV_EXPORTS_TOTAL.labels(result="truncated").inc()
    else:
        obs_metrics.MOD_CSV_EXPORTS_TOTAL.labels(result="ok").inc()

    headers = [
        "case_id",
        "subject_type",
        "subject_id",
        "status",
        "severity",
        "reason",
        "assigned_to",
        "campus_id",
        "created_at",
        "updated_at",
        "last_action",
    ]

    def _stream() -> Iterable[bytes]:
        buffer = io.StringIO()
        writer = csv.writer(buffer)
        writer.writerow(headers)
        yield buffer.getvalue().encode("utf-8")
        buffer.seek(0)
        buffer.truncate(0)
        for row in rows:
            writer.writerow(_row_to_csv(row))
            yield buffer.getvalue().encode("utf-8")
            buffer.seek(0)
            buffer.truncate(0)

    obs_metrics.MOD_ADMIN_REQUESTS_TOTAL.labels(route="cases.export", status="200").inc()
    return StreamingResponse(
        _stream(),
        media_type="text/csv",
        headers={"Content-Disposition": "attachment; filename=moderation-cases.csv"},
    )
