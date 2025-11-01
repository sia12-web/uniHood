"""Utilities for moderation actions targeting group memberships."""

from __future__ import annotations

from typing import Any, Mapping

from app.moderation.domain.enforcement import ModerationCase

MEMBERSHIP_ACTIONS = {"ban", "mute"}


def ensure_membership_identifiers(
    action: str,
    payload: dict[str, Any],
    *,
    case: ModerationCase | None = None,
    target: Mapping[str, Any] | None = None,
    subject: Mapping[str, Any] | None = None,
    require: bool = False,
) -> bool:
    """Populate membership payload identifiers where possible.

    Returns True when both ``group_id`` and ``user_id`` are present after augmentation.
    When ``require`` is True and identifiers are missing, a ValueError is raised.
    """

    if action not in MEMBERSHIP_ACTIONS:
        return True

    group_id = _first_non_empty(
        payload.get("group_id"),
        payload.get("group"),
        payload.get("group_uuid"),
        _mapping_lookup(target, "group_id"),
        _mapping_lookup(target, "group"),
        _mapping_lookup(target, "group_uuid"),
        _group_from_subject(subject),
        _group_from_case(case),
    )
    user_id = _first_non_empty(
        payload.get("user_id"),
        payload.get("member_id"),
        payload.get("target_user_id"),
        _mapping_lookup(target, "user_id"),
        _mapping_lookup(target, "member_id"),
        _mapping_lookup(target, "target_user_id"),
        _user_from_target(target),
        _user_from_subject(subject),
        _user_from_case(case),
    )

    if group_id is not None:
        payload.setdefault("group_id", str(group_id))
    if user_id is not None:
        user_value = str(user_id)
        payload.setdefault("user_id", user_value)
        payload.setdefault("target_user_id", user_value)

    complete = bool(payload.get("group_id")) and bool(payload.get("user_id"))
    if require and not complete:
        raise ValueError("membership_context_missing")
    return complete


def _mapping_lookup(mapping: Mapping[str, Any] | None, key: str) -> Any:
    if not mapping:
        return None
    return mapping.get(key)


def _group_from_subject(subject: Mapping[str, Any] | None) -> Any:
    if not subject:
        return None
    if subject.get("type") == "group":
        return subject.get("id")
    if subject.get("type") == "membership":
        return subject.get("group_id")
    return None


def _group_from_case(case: ModerationCase | None) -> Any:
    if not case:
        return None
    if case.subject_type == "group":
        return case.subject_id
    return None


def _user_from_target(target: Mapping[str, Any] | None) -> Any:
    if not target:
        return None
    if target.get("type") == "user":
        return target.get("id") or target.get("user_id")
    return target.get("member_id")


def _user_from_subject(subject: Mapping[str, Any] | None) -> Any:
    if not subject:
        return None
    if subject.get("type") == "user":
        return subject.get("id")
    if subject.get("type") == "membership":
        return subject.get("user_id")
    return None


def _user_from_case(case: ModerationCase | None) -> Any:
    if not case:
        return None
    if case.subject_type == "user":
        return case.subject_id
    return None


def _first_non_empty(*values: Any) -> Any:
    for value in values:
        if value is None:
            continue
        if isinstance(value, str) and not value.strip():
            continue
        return value
    return None
