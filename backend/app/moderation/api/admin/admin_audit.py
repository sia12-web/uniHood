"""Moderation audit viewer for staff."""

from __future__ import annotations

from datetime import datetime
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel

from app.infra.auth import AuthenticatedUser, get_current_user
from app.infra.postgres import get_pool
from app.infra.rate_limit import allow
from app.moderation.domain.pagination import KeysetCursor, decode_cursor, encode_cursor, build_keyset_predicate
from app.moderation.domain.rbac import StaffContext, resolve_staff_context, restrict_campuses
from app.obs import metrics as obs_metrics

router = APIRouter(prefix="/api/mod/v1/admin/audit", tags=["moderation-admin-audit"])

_AUDIT_RATE_KEY = "mod_admin_audit_list"
_AUDIT_RATE_LIMIT = 60
_AUDIT_RATE_WINDOW = 10


class AuditEntry(BaseModel):
    id: int
    actor_id: str | None
    action: str
    target_type: str
    target_id: str
    meta: dict[str, Any]
    created_at: datetime

    model_config = {"populate_by_name": True}


class AuditListResponse(BaseModel):
    items: list[AuditEntry]
    next: str | None = None

    model_config = {"populate_by_name": True}


async def _enforce_rate(context: StaffContext) -> None:
    allowed = await allow(_AUDIT_RATE_KEY, context.actor_id, limit=_AUDIT_RATE_LIMIT, window_seconds=_AUDIT_RATE_WINDOW)
    if not allowed:
        raise HTTPException(status_code=429, detail="rate_limited")


async def _get_context(user: AuthenticatedUser = Depends(get_current_user)) -> StaffContext:
    return resolve_staff_context(user)


@router.get("", response_model=AuditListResponse)
async def list_audit_entries(
    *,
    target_type: str | None = Query(default=None),
    target_id: str | None = Query(default=None),
    actor_id: str | None = Query(default=None),
    campus_id: list[str] = Query(default_factory=list),
    created_from: datetime | None = Query(default=None),
    created_to: datetime | None = Query(default=None),
    limit: int = Query(default=50, ge=1, le=100),
    after: str | None = Query(default=None),
    context: StaffContext = Depends(_get_context),
) -> AuditListResponse:
    await _enforce_rate(context)
    allowed_campuses = restrict_campuses(context, campus_id or None)
    if allowed_campuses and target_type and target_type != "case":
        raise HTTPException(status_code=400, detail="campus_filter_requires_case")
    join_case = bool(allowed_campuses)
    clauses: list[str] = []
    params: list[Any] = []
    if target_type:
        params.append(target_type)
        clauses.append(f"a.target_type = ${len(params)}")
    elif not context.is_admin:
        params.append("case")
        clauses.append(f"a.target_type = ${len(params)}")
    if target_id:
        params.append(target_id)
        clauses.append(f"a.target_id = ${len(params)}")
    if actor_id:
        params.append(actor_id)
        clauses.append(f"a.actor_id = ${len(params)}")
    if created_from:
        params.append(created_from)
        clauses.append(f"a.created_at >= ${len(params)}")
    if created_to:
        params.append(created_to)
        clauses.append(f"a.created_at <= ${len(params)}")
    if allowed_campuses:
        params.append(list(allowed_campuses))
        clauses.append(f"CAST(c.campus_id AS text) = ANY(${len(params)}::text[])")
    cursor: KeysetCursor | None = None
    if after:
        try:
            cursor = decode_cursor(after)
        except ValueError as exc:
            raise HTTPException(status_code=400, detail=str(exc)) from exc
    cursor_clause = ""
    if cursor:
        cursor_clause = build_keyset_predicate(
            sort_column="a.created_at",
            id_column="a.id",
            order="desc",
            cursor=cursor,
            params=params,
        )
    where_sql = " AND ".join(clauses)
    if cursor_clause:
        where_sql = f"{where_sql} AND {cursor_clause}" if where_sql else cursor_clause
    query_parts = [
        "SELECT a.id, a.actor_id, a.action, a.target_type, a.target_id, a.meta, a.created_at",
        "FROM mod_audit a",
    ]
    if join_case:
        query_parts.append("JOIN mod_case c ON CAST(c.id AS text) = a.target_id")
    if where_sql:
        query_parts.append(f"WHERE {where_sql}")
    query_parts.append("ORDER BY a.created_at DESC, a.id DESC")
    query_parts.append(f"LIMIT {min(limit, 100) + 1}")
    pool = await get_pool()
    async with pool.acquire() as conn:
        rows = await conn.fetch("\n".join(query_parts), *params)
    has_next = len(rows) > limit
    if has_next:
        rows = rows[:limit]
    items = [AuditEntry(**dict(row)) for row in rows]
    next_cursor: str | None = None
    if has_next and rows:
        last = rows[-1]
        next_cursor = encode_cursor(
            KeysetCursor(sort_value=last["created_at"], entity_id=str(last["id"]), sort_field="created_at")
        )
    obs_metrics.MOD_ADMIN_REQUESTS_TOTAL.labels(route="audit.list", status="200").inc()
    return AuditListResponse(items=items, next=next_cursor)
