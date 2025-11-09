"""Middleware to bind a request id to request.state and response headers.

Phase A hardening: ensures every request/response pair carries an X-Request-Id
header and makes the id available to endpoint code via request.state.
"""

from __future__ import annotations

import uuid
from starlette.middleware.base import BaseHTTPMiddleware
from fastapi import Request

from app.api.request_id import REQUEST_ID_ATTR


class RequestIdMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):  # type: ignore[override]
        rid = request.headers.get("X-Request-Id") or str(uuid.uuid4())
        setattr(request.state, REQUEST_ID_ATTR, rid)
        response = await call_next(request)
        # Preserve existing header if set earlier (e.g. by other middleware) but ensure presence
        if "X-Request-Id" not in response.headers:
            response.headers["X-Request-Id"] = rid
        return response
