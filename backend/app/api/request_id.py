"""Request ID helper for endpoints (Phase A spec).

Stores a request id on `request.state` via the RequestIdMiddleware. Provides
`get_request_id` that returns that id or generates a new UUID when called
outside of a request context.
"""

from __future__ import annotations

import uuid
from fastapi import Request

REQUEST_ID_ATTR = "request_id"


def get_request_id(request: Request | None = None) -> str:
    """Return the current request id, generating one if absent.

    If called with no request (e.g. during background task initialisation), a
    new UUIDv4 is returned so callers can still attach correlation headers.
    """
    if request is None:
        return str(uuid.uuid4())
    rid = getattr(request.state, REQUEST_ID_ATTR, None)
    return rid or str(uuid.uuid4())
