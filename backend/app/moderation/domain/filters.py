"""Query building for moderation admin case listings."""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime
from typing import Iterable, Sequence

from .pagination import KeysetCursor, SortOrder, build_keyset_predicate

_ALLOWED_STATUSES = {"open", "actioned", "dismissed", "escalated", "closed"}
_ALLOWED_REASONS = {"report", "auto_policy", "escalation"}
_ALLOWED_SUBJECT_TYPES = {"post", "comment", "user", "group", "event", "message"}

_SORT_COLUMN_MAP = {
    "created_at": "c.created_at",
    "updated_at": "c.updated_at",
    "severity": "c.severity",
}


@dataclass(slots=True)
class CaseFilterSet:
    """Filter inputs for the case list endpoint."""

    status: str | None = None
    severity_min: int | None = None
    severity_max: int | None = None
    assigned_to: str | None = None
    assigned_is_null: bool = False
    subject_types: tuple[str, ...] = ()
    campus_ids: tuple[str, ...] = ()
    reasons: tuple[str, ...] = ()
    appeal_open: bool | None = None
    created_from: datetime | None = None
    created_to: datetime | None = None
    search: str | None = None

    def normalized(self) -> "CaseFilterSet":
        status = self.status if self.status in _ALLOWED_STATUSES else None
        reasons = tuple(reason for reason in self.reasons if reason in _ALLOWED_REASONS)
        subject_types = tuple(st for st in self.subject_types if st in _ALLOWED_SUBJECT_TYPES)
        return CaseFilterSet(
            status=status,
            severity_min=self.severity_min,
            severity_max=self.severity_max,
            assigned_to=self.assigned_to,
            assigned_is_null=self.assigned_is_null,
            subject_types=subject_types,
            campus_ids=self.campus_ids,
            reasons=reasons,
            appeal_open=self.appeal_open,
            created_from=self.created_from,
            created_to=self.created_to,
            search=self.search,
        )

    def apply_campus_scope(self, campuses: Iterable[str] | None) -> "CaseFilterSet":
        if campuses is None:
            return self
        requested = set(self.campus_ids)
        scoped = tuple(cid for cid in campuses if not requested or cid in requested)
        return CaseFilterSet(
            status=self.status,
            severity_min=self.severity_min,
            severity_max=self.severity_max,
            assigned_to=self.assigned_to,
            assigned_is_null=self.assigned_is_null,
            subject_types=self.subject_types,
            campus_ids=scoped,
            reasons=self.reasons,
            appeal_open=self.appeal_open,
            created_from=self.created_from,
            created_to=self.created_to,
            search=self.search,
        )

    def where_clause(self, params: list[object]) -> str:
        normalized = self.normalized()
        clauses: list[str] = []
        if normalized.status:
            params.append(normalized.status)
            clauses.append(f"c.status = ${len(params)}")
        if normalized.severity_min is not None:
            params.append(normalized.severity_min)
            clauses.append(f"c.severity >= ${len(params)}")
        if normalized.severity_max is not None:
            params.append(normalized.severity_max)
            clauses.append(f"c.severity <= ${len(params)}")
        if normalized.assigned_is_null:
            clauses.append("c.assigned_to IS NULL")
        elif normalized.assigned_to:
            params.append(normalized.assigned_to)
            clauses.append(f"c.assigned_to = ${len(params)}")
        if normalized.subject_types:
            params.append(list(normalized.subject_types))
            clauses.append(f"c.subject_type = ANY(${len(params)}::text[])")
        if normalized.campus_ids:
            params.append(list(normalized.campus_ids))
            clauses.append(f"CAST(c.campus_id AS text) = ANY(${len(params)}::text[])")
        if normalized.reasons:
            params.append(list(normalized.reasons))
            clauses.append(f"c.reason = ANY(${len(params)}::text[])")
        if normalized.appeal_open is not None:
            params.append(normalized.appeal_open)
            clauses.append(f"c.appeal_open = ${len(params)}")
        if normalized.created_from is not None:
            params.append(normalized.created_from)
            clauses.append(f"c.created_at >= ${len(params)}")
        if normalized.created_to is not None:
            params.append(normalized.created_to)
            clauses.append(f"c.created_at <= ${len(params)}")
        if normalized.search:
            params.append(f"%{normalized.search}%")
            idx = len(params)
            clauses.append(
                f"(CAST(c.subject_id AS text) ILIKE ${idx} OR c.reason ILIKE ${idx})"
            )
        return " AND ".join(clauses)


@dataclass(slots=True)
class CaseQuery:
    filters: CaseFilterSet = field(default_factory=CaseFilterSet)
    sort_field: str = "created_at"
    order: SortOrder = "desc"
    cursor: KeysetCursor | None = None
    limit: int = 50

    def column(self) -> str:
        return _SORT_COLUMN_MAP.get(self.sort_field, "c.created_at")

    def order_by(self) -> str:
        direction = "ASC" if self.order == "asc" else "DESC"
        return f"{self.column()} {direction}, c.id {direction}"

    def build_where(self, params: list[object]) -> str:
        where = self.filters.where_clause(params)
        keyset_clause = ""
        if self.cursor:
            keyset_clause = build_keyset_predicate(
                sort_column=self.column(),
                order=self.order,
                cursor=self.cursor,
                params=params,
            )
        if where and keyset_clause:
            return f"{where} AND {keyset_clause}"
        if keyset_clause:
            return keyset_clause
        return where

    def sanitized_limit(self) -> int:
        if self.limit <= 0:
            return 1
        return min(self.limit, 100)
