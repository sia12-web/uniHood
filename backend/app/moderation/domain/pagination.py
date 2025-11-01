"""Keyset pagination helpers for moderation admin surfaces."""

from __future__ import annotations

import base64
import binascii
import json
from dataclasses import dataclass
from datetime import datetime
from typing import Any, Literal


SortOrder = Literal["asc", "desc"]


@dataclass(slots=True)
class KeysetCursor:
    """Represents the state required to resume a keyset page."""

    sort_value: Any
    entity_id: str
    sort_field: str


def encode_cursor(cursor: KeysetCursor) -> str:
    """Encode a cursor payload using URL-safe base64."""

    payload: dict[str, Any]
    sort_value = cursor.sort_value
    if isinstance(sort_value, datetime):
        payload = {
            "v": sort_value.isoformat(),
            "t": "datetime",
            "id": cursor.entity_id,
            "f": cursor.sort_field,
        }
    elif isinstance(sort_value, (int, float)):
        payload = {
            "v": sort_value,
            "t": "number",
            "id": cursor.entity_id,
            "f": cursor.sort_field,
        }
    else:
        payload = {
            "v": str(sort_value),
            "t": "string",
            "id": cursor.entity_id,
            "f": cursor.sort_field,
        }
    raw = json.dumps(payload, separators=(",", ":")).encode("utf-8")
    return base64.urlsafe_b64encode(raw).decode("ascii")


def decode_cursor(value: str) -> KeysetCursor:
    """Decode a cursor string produced by :func:`encode_cursor`."""

    try:
        raw = base64.urlsafe_b64decode(value.encode("ascii"))
        payload = json.loads(raw.decode("utf-8"))
    except (ValueError, json.JSONDecodeError, binascii.Error) as exc:
        raise ValueError("invalid_cursor") from exc
    sort_type = payload.get("t")
    sort_value: Any
    if sort_type == "datetime":
        sort_value = datetime.fromisoformat(payload["v"])
    elif sort_type == "number":
        sort_value = payload["v"]
    else:
        sort_value = str(payload.get("v", ""))
    entity_id = str(payload.get("id"))
    if not entity_id:
        raise ValueError("invalid_cursor")
    sort_field = str(payload.get("f") or "created_at")
    return KeysetCursor(sort_value=sort_value, entity_id=entity_id, sort_field=sort_field)


def build_keyset_predicate(
    *,
    sort_column: str,
    order: SortOrder,
    cursor: KeysetCursor,
    params: list[Any],
    id_column: str = "c.id",
) -> str:
    """Append cursor parameters and return the SQL predicate for keyset pagination."""

    comparator = ">" if order == "asc" else "<"
    value_idx = len(params) + 1
    id_idx = value_idx + 1
    params.extend([cursor.sort_value, cursor.entity_id])
    return f"({sort_column}, {id_column}) {comparator} (${value_idx}, ${id_idx})"
