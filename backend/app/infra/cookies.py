"""Cookie helpers for auth refresh flows.

Central policy:
- refresh_token: httpOnly, Secure(flag), SameSite (configurable), Path=/auth/refresh
- rf_fp: non-HttpOnly fingerprint indicator, Path=/ (allows presence detection globally)
"""

from __future__ import annotations

from datetime import timedelta

from fastapi import Response

from app.settings import settings


REFRESH_COOKIE_NAME = "refresh_token"
FINGERPRINT_COOKIE_NAME = "rf_fp"
REFRESH_COOKIE_PATH = "/auth/refresh"
FINGERPRINT_PATH = "/"

_SAMESITE = settings.cookie_samesite.capitalize() if getattr(settings, "cookie_samesite", None) else "Strict"
_REFRESH_MAX_AGE = getattr(settings, "refresh_ttl_days", 30) * 24 * 60 * 60


def set_refresh_cookies(response: Response, *, refresh_token: str, rf_fp: str) -> None:
    """Set refresh + fingerprint cookies with configured security flags."""
    response.set_cookie(
        key=REFRESH_COOKIE_NAME,
        value=refresh_token,
        httponly=True,
        secure=bool(settings.cookie_secure),
        samesite=_SAMESITE,
        domain=settings.cookie_domain,
        path=REFRESH_COOKIE_PATH,
        max_age=_REFRESH_MAX_AGE,
    )
    response.set_cookie(
        key=FINGERPRINT_COOKIE_NAME,
        value=rf_fp,
        httponly=False,
        secure=bool(settings.cookie_secure),
        samesite=_SAMESITE,
        domain=settings.cookie_domain,
        path=FINGERPRINT_PATH,
        max_age=_REFRESH_MAX_AGE,
    )


def clear_refresh_cookies(response: Response) -> None:
    """Remove refresh + fingerprint cookies by setting expired values."""
    response.delete_cookie(REFRESH_COOKIE_NAME, path=REFRESH_COOKIE_PATH, domain=settings.cookie_domain)
    response.delete_cookie(FINGERPRINT_COOKIE_NAME, path=FINGERPRINT_PATH, domain=settings.cookie_domain)
