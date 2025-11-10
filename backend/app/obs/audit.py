from __future__ import annotations

from typing import Any, Mapping, Optional

from fastapi import Request

from app.api.request_id import get_request_id
from app.infra.auth import AuthenticatedUser
from app.obs.logging import get_logger

audit_logger = get_logger("audit.intent")


async def log_signed_intent_event(
    request: Request,
    user: AuthenticatedUser,
    event: str,
    *,
    extra: Optional[Mapping[str, Any]] = None,
) -> None:
    intent = getattr(request.state, "intent", None)
    payload: dict[str, Any] = {
        "event": event,
        "method": request.method,
        "path": request.url.path,
        "user_id": str(user.id),
        "session_id": str(user.session_id) if user.session_id else None,
        "intent_verified": bool(intent),
        "intent_user_id": getattr(request.state, "intent_user_id", None),
        "intent_nonce": getattr(request.state, "intent_nonce", None),
        "intent_ts": getattr(request.state, "intent_ts", None),
        "intent_body_sha": getattr(request.state, "intent_body_sha", None),
        "idem_key": getattr(request.state, "idem_key", None),
        "request_id": get_request_id(request),
        "ip": request.client.host if request.client else None,
        "user_agent": request.headers.get("user-agent"),
    }
    if extra:
        payload.update(extra)
    filtered = {key: value for key, value in payload.items() if value is not None}
    audit_logger.info("signed_intent", extra=filtered)
