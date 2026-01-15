from __future__ import annotations

import base64
import json
from datetime import datetime
from typing import Any, Iterable


def encode_cursor(dt: datetime, id: str) -> str:
    payload = {"t": dt.isoformat(), "id": id}
    return base64.urlsafe_b64encode(json.dumps(payload).encode()).decode()


def decode_cursor(s: str) -> tuple[datetime, str]:
    data = json.loads(base64.urlsafe_b64decode(s.encode()).decode())
    return (datetime.fromisoformat(data["t"]), data["id"])


def apply_keyset(query_base: str, params: Iterable[Any], cursor: str | None) -> tuple[str, list[Any]]:
    bindings = list(params)
    if not cursor:
        return query_base, bindings
    dt, last_id = decode_cursor(cursor)
    clause = " AND (created_at, id) < ($1, $2)" if "$1" not in query_base else " AND (created_at, id) < ($%d, $%d)"  # type: ignore[truthy-bool]  # noqa: E501
    idx = len(bindings) + 1
    clause = f" AND (created_at, id) < (${idx}, ${idx + 1})"
    query = f"{query_base}{clause}"
    bindings.extend([dt, last_id])
    return query, bindings
