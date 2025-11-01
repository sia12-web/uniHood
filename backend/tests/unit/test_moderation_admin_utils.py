from __future__ import annotations

import base64
from datetime import datetime, timezone

import pytest
from fastapi import HTTPException

from app.infra.auth import AuthenticatedUser
from app.moderation.domain.filters import CaseFilterSet, CaseQuery
from app.moderation.domain.pagination import KeysetCursor, decode_cursor, encode_cursor
from app.moderation.domain.rbac import resolve_staff_context, restrict_campuses


def test_case_filter_set_normalization_and_where_clause() -> None:
    filters = CaseFilterSet(
        status="invalid",
        severity_min=1,
        severity_max=5,
        assigned_to="moderator",
        subject_types=("post", "invalid"),
        campus_ids=("campus-a",),
        reasons=("report", "foo"),
        appeal_open=True,
    )
    params: list[object] = []
    where = filters.where_clause(params)
    # Status should be dropped, but other filters remain
    assert "c.status" not in where
    assert "c.severity >=" in where
    assert params[0] == 1
    assert params[1] == 5
    assert params[-1] is True


def test_case_query_keyset_clause_builds_params() -> None:
    cursor = KeysetCursor(sort_value=datetime.now(timezone.utc), entity_id="case-1", sort_field="created_at")
    query = CaseQuery(filters=CaseFilterSet(), sort_field="created_at", cursor=cursor, limit=10)
    params: list[object] = []
    where = query.build_where(params)
    assert params[-2:] == [cursor.sort_value, cursor.entity_id]
    assert "created_at" in where


def test_cursor_round_trip() -> None:
    cursor = KeysetCursor(sort_value=42, entity_id="abc", sort_field="severity")
    encoded = encode_cursor(cursor)
    assert encoded
    # Ensure the encoded cursor is valid base64 so API clients can round trip
    base64.urlsafe_b64decode(encoded.encode("ascii"))
    decoded = decode_cursor(encoded)
    assert decoded == cursor


def test_rbac_moderator_campus_scope() -> None:
    user = AuthenticatedUser(id="moderator", campus_id="campus-a", roles=("staff.moderator",))
    context = resolve_staff_context(user)
    assert context.is_moderator and not context.is_admin
    allowed = restrict_campuses(context, ("campus-a", "campus-b"))
    assert allowed == ("campus-a",)
    with pytest.raises(HTTPException):
        restrict_campuses(context, ("campus-b",))


def test_rbac_admin_global_scope() -> None:
    user = AuthenticatedUser(id="admin", campus_id="campus-a", roles=("staff.admin",))
    context = resolve_staff_context(user)
    campuses = restrict_campuses(context, ("campus-a", "campus-b"))
    assert campuses == ("campus-a", "campus-b")
    # Admin without requested campuses should get empty tuple to signal no restriction
    unrestricted = restrict_campuses(context, None)
    assert unrestricted == ()
