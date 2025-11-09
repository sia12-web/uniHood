"""Request ID helper for endpoints.

Relies on observability middleware binding the request id into the logging
context. Falls back to a simple header approach if contextvar missing.
"""

from __future__ import annotations

from typing import Optional

try:
    from app.obs import logging as obs_logging  # type: ignore
except Exception:  # pragma: no cover - fallback if module layout changes
    obs_logging = None  # type: ignore


def get_request_id(default: str = "unknown") -> str:
    """Return the current request id if bound, else a default.

    The observability middleware binds a request id into a ContextVar the
    logging module exposes. We read it here to add headers on error paths.
    """
    if obs_logging is None:
        return default
    try:
        rid: Optional[str] = obs_logging._REQUEST_ID.get()  # type: ignore[attr-defined]
    except Exception:  # pragma: no cover - defensive
        return default
    return rid or default
