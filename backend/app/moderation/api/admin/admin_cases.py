"""Staff-facing moderation case management endpoints."""

from __future__ import annotations

import time
from datetime import datetime
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel, Field

from app.infra.auth import AuthenticatedUser, get_current_user
from app.infra.postgres import get_pool
from app.infra.rate_limit import allow
from app.moderation.domain.cases_service import (
    CaseNotFoundError,
    CaseService,
    ModerationWorkflowError,
)
from app.moderation.domain.container import get_case_service
from app.moderation.domain.filters import CaseFilterSet, CaseQuery
from app.moderation.domain.pagination import KeysetCursor, decode_cursor, encode_cursor
from app.moderation.domain.rbac import (
    StaffContext,
    ensure_action_permission,
    resolve_staff_context,
    restrict_campuses,
)
from app.obs import metrics as obs_metrics

router = APIRouter(prefix="/api/mod/v1/admin/cases", tags=["moderation-admin-cases"])

_CASES_RATE_KEY = "mod_admin_cases_list"
_CASES_RATE_LIMIT = 60
_CASES_RATE_WINDOW = 10
_BATCH_RATE_KEY = "mod_admin_cases_batch"
_BATCH_RATE_LIMIT = 60
_BATCH_RATE_WINDOW = 10


class CaseListItem(BaseModel):
    id: str = Field(alias="case_id")
    subject_type: str
    subject_id: str
    status: str
    severity: int
    reason: str
    assigned_to: str | None = None
    campus_id: str | None = None
    created_at: datetime
    updated_at: datetime
    appeal_open: bool
    escalation_level: int

    model_config = {"populate_by_name": True}


class CaseListResponse(BaseModel):
    items: list[CaseListItem]
    next: str | None = None
    total_estimate: int | None = None

    model_config = {"populate_by_name": True}


class ActionSummary(BaseModel):
    action: str
    actor_id: str | None = None
    created_at: datetime
    payload: dict[str, Any]

    model_config = {"populate_by_name": True}


class CaseDetailResponse(BaseModel):
    case: CaseListItem
    reporter_count: int
    last_action: ActionSummary | None
    appeal_status: str | None

    model_config = {"populate_by_name": True}


class BatchActionRequest(BaseModel):
    case_ids: list[str]
    action: str
    payload: dict[str, Any] | None = None
    reason_note: str | None = None

class BatchActionResult(BaseModel):
    case_id: str
    ok: bool
    error: str | None = None

    model_config = {"populate_by_name": True}


async def _enforce_rate_limit(kind: str, actor_id: str, *, limit: int, window: int) -> None:
    allowed = await allow(kind, actor_id, limit=limit, window_seconds=window)
    if not allowed:
        raise HTTPException(status.HTTP_429_TOO_MANY_REQUESTS, detail="rate_limited")


async def _get_context(user: AuthenticatedUser = Depends(get_current_user)) -> StaffContext:
    return resolve_staff_context(user)


def _assigned_filter(value: str | None, actor_id: str) -> tuple[str | None, bool]:
    if value == "me":
        return actor_id, False
    if value == "none":
        return None, True
    return value, False


@router.get("", response_model=CaseListResponse)
async def list_cases(
    *,
    status: str | None = Query(default=None),
    severity_min: int | None = Query(default=None, ge=0),
    severity_max: int | None = Query(default=None, ge=0),
    assigned_to: str | None = Query(default=None, description="Use 'me' or 'none' for shortcuts"),
    subject_type: list[str] = Query(default_factory=list),
    campus_id: list[str] = Query(default_factory=list),
    reason: list[str] = Query(default_factory=list),
    appeal_open: bool | None = Query(default=None),
    created_from: datetime | None = Query(default=None),
    created_to: datetime | None = Query(default=None),
    q: str | None = Query(default=None),
    sort: str = Query(default="created_at"),
    order: str = Query(default="desc"),
    limit: int = Query(default=50, ge=1, le=100),
    after: str | None = Query(default=None),
    include_total: bool = Query(default=False),
    context: StaffContext = Depends(_get_context),
) -> CaseListResponse:
    await _enforce_rate_limit(_CASES_RATE_KEY, context.actor_id, limit=_CASES_RATE_LIMIT, window=_CASES_RATE_WINDOW)
    start = time.perf_counter()
    allowed_campuses = restrict_campuses(context, campus_id or None)
    assigned_value, assigned_is_null = _assigned_filter(assigned_to, context.actor_id)
    filters = CaseFilterSet(
        status=status,
        severity_min=severity_min,
        severity_max=severity_max,
        assigned_to=assigned_value,
        assigned_is_null=assigned_is_null,
        subject_types=tuple(subject_type),
        campus_ids=tuple(allowed_campuses),
        reasons=tuple(reason),
        appeal_open=appeal_open,
        created_from=created_from,
        created_to=created_to,
        search=q,
    )
    cursor: KeysetCursor | None = None
    if after:
        try:
            cursor = decode_cursor(after)
        except ValueError as exc:
            raise HTTPException(status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc
    query = CaseQuery(filters=filters, sort_field=sort, order="asc" if order == "asc" else "desc", cursor=cursor, limit=limit)
    params: list[Any] = []
    where_clause = query.build_where(params)
    sql = [
        "SELECT c.id AS case_id, c.subject_type, c.subject_id, c.status, c.severity, c.reason,",
        "       c.assigned_to, CAST(c.campus_id AS text) AS campus_id, c.created_at, c.updated_at,",
        "       c.appeal_open, c.escalation_level, c." + query.column().split(".")[-1] + " AS sort_field",
        "FROM mod_case c",
    ]
    if where_clause:
        sql.append(f"WHERE {where_clause}")
    sql.append(f"ORDER BY {query.order_by()}")
    sql.append(f"LIMIT {query.sanitized_limit() + 1}")
    pool = await get_pool()
    async with pool.acquire() as conn:
        rows = await conn.fetch("\n".join(sql), *params)
        total_estimate: int | None = None
        if include_total:
            count_where_params: list[Any] = []
            count_where = query.filters.where_clause(count_where_params)
            count_sql = "SELECT COUNT(*) FROM mod_case c"
            if count_where:
                count_sql += f" WHERE {count_where}"
            total_val = await conn.fetchval(count_sql, *count_where_params)
            total_estimate = int(total_val or 0)
    has_next = len(rows) > limit
    if has_next:
        rows = rows[:limit]
    items: list[CaseListItem] = []
    for row in rows:
        payload = dict(row)
        payload.pop("sort_field", None)
        items.append(CaseListItem(**payload))
    next_cursor: str | None = None
    if has_next and rows:
        last = rows[-1]
        next_cursor = encode_cursor(
            KeysetCursor(sort_value=last["sort_field"], entity_id=str(last["case_id"]), sort_field=query.sort_field)
        )
    elapsed_ms = (time.perf_counter() - start) * 1000.0
    obs_metrics.MOD_ADMIN_REQUESTS_TOTAL.labels(route="cases.list", status="200").inc()
    obs_metrics.MOD_CASE_LIST_LATENCY_MS.observe(elapsed_ms)
    return CaseListResponse(items=items, next=next_cursor, total_estimate=total_estimate)


@router.get("/{case_id}", response_model=CaseDetailResponse)
async def get_case_detail(case_id: str, context: StaffContext = Depends(_get_context), service: CaseService = Depends(get_case_service)) -> CaseDetailResponse:
    pool = await get_pool()
    async with pool.acquire() as conn:
        row = await conn.fetchrow(
            """
            SELECT
                c.id AS case_id,
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
                (SELECT action FROM mod_action WHERE case_id = c.id ORDER BY created_at DESC LIMIT 1) AS last_action_name,
                (SELECT payload FROM mod_action WHERE case_id = c.id ORDER BY created_at DESC LIMIT 1) AS last_action_payload,
                (SELECT actor_id FROM mod_action WHERE case_id = c.id ORDER BY created_at DESC LIMIT 1) AS last_action_actor,
                (SELECT created_at FROM mod_action WHERE case_id = c.id ORDER BY created_at DESC LIMIT 1) AS last_action_at,
                (SELECT COUNT(*) FROM mod_report WHERE case_id = c.id) AS reporter_count,
                (SELECT status FROM mod_appeal WHERE case_id = c.id ORDER BY created_at DESC LIMIT 1) AS appeal_status
            FROM mod_case c
            WHERE c.id = $1
            """,
            case_id,
        )
    if row is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="case_not_found")
    campus = row["campus_id"]
    if campus:
        restrict_campuses(context, [campus])
    case_payload = {
        "case_id": row["case_id"],
        "subject_type": row["subject_type"],
        "subject_id": row["subject_id"],
        "status": row["status"],
        "severity": row["severity"],
        "reason": row["reason"],
        "assigned_to": row["assigned_to"],
        "campus_id": row["campus_id"],
        "created_at": row["created_at"],
        "updated_at": row["updated_at"],
        "appeal_open": row["appeal_open"],
        "escalation_level": row["escalation_level"],
    }
    case = CaseListItem(**case_payload)
    last_action: ActionSummary | None = None
    if row["last_action_name"]:
        payload = row["last_action_payload"]
        if isinstance(payload, dict):
            payload_dict = payload
        else:
            payload_dict = {}
        last_action = ActionSummary(
            action=row["last_action_name"],
            actor_id=row["last_action_actor"],
            created_at=row["last_action_at"],
            payload=payload_dict,
        )
    obs_metrics.MOD_ADMIN_REQUESTS_TOTAL.labels(route="cases.detail", status="200").inc()
    return CaseDetailResponse(
        case=case,
        reporter_count=int(row["reporter_count"] or 0),
        last_action=last_action,
        appeal_status=row["appeal_status"],
    )


@router.post("/batch_action", response_model=dict)
async def batch_action(
    payload: BatchActionRequest,
    context: StaffContext = Depends(_get_context),
    service: CaseService = Depends(get_case_service),
) -> dict[str, Any]:
    await _enforce_rate_limit(_BATCH_RATE_KEY, context.actor_id, limit=_BATCH_RATE_LIMIT, window=_BATCH_RATE_WINDOW)
    action = payload.action
    ensure_action_permission(context, action=action)
    if not payload.case_ids:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, detail="case_ids_required")
    if len(payload.case_ids) > 1000:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, detail="case_ids_limit")
    results: list[BatchActionResult] = []
    for case_id in payload.case_ids[:1000]:
        try:
            if action == "assign":
                moderator_id = payload.payload.get("moderator_id") if payload.payload else None
                if not moderator_id:
                    raise HTTPException(status.HTTP_400_BAD_REQUEST, detail="moderator_id_required")
                await service.assign_case(case_id=case_id, moderator_id=moderator_id, actor_id=context.actor_id)
            elif action == "escalate":
                await service.escalate_case(case_id=case_id, actor_id=context.actor_id)
            elif action == "dismiss":
                await service.dismiss_case(case_id=case_id, actor_id=context.actor_id, note=payload.reason_note)
            elif action == "apply_enforcement":
                decision = payload.payload.get("decision") if payload.payload else None
                if not decision:
                    raise HTTPException(status.HTTP_400_BAD_REQUEST, detail="decision_required")
                await service.perform_case_action(
                    case_id=case_id,
                    actor_id=context.actor_id,
                    action=decision,
                    payload=payload.payload.get("payload") if payload.payload else None,
                )
            else:
                raise HTTPException(status.HTTP_400_BAD_REQUEST, detail="unknown_action")
            results.append(BatchActionResult(case_id=case_id, ok=True))
            obs_metrics.MOD_BATCH_ACTIONS_TOTAL.labels(action=action, result="ok").inc()
        except HTTPException as exc:
            obs_metrics.MOD_BATCH_ACTIONS_TOTAL.labels(action=action, result="error").inc()
            raise exc
        except (CaseNotFoundError, ModerationWorkflowError) as exc:
            obs_metrics.MOD_BATCH_ACTIONS_TOTAL.labels(action=action, result="error").inc()
            results.append(BatchActionResult(case_id=case_id, ok=False, error=str(exc)))
        except Exception as exc:  # noqa: BLE001
            obs_metrics.MOD_BATCH_ACTIONS_TOTAL.labels(action=action, result="error").inc()
            results.append(BatchActionResult(case_id=case_id, ok=False, error=str(exc)))
    obs_metrics.MOD_ADMIN_REQUESTS_TOTAL.labels(route="cases.batch_action", status="200").inc()
    return {"results": [result.dict() for result in results]}
