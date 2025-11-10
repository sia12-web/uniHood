from __future__ import annotations

import uuid

from starlette.middleware.base import BaseHTTPMiddleware


class IdempotencyMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request, call_next):  # type: ignore[override]
        key = request.headers.get("Idempotency-Key") or str(uuid.uuid4())
        setattr(request.state, "idem_key", key)
        response = await call_next(request)
        response.headers["Idempotency-Key"] = key
        return response
