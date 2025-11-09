"""Cookie helpers for auth refresh flows.

Encapsulates setting and clearing refresh cookies according to security policy:
- refresh_token: httpOnly, Secure, SameSite=Strict, Path=/auth/refresh
- rf_fp: non-HttpOnly, Secure, SameSite=Strict, Path=/auth/refresh
"""

from __future__ import annotations

from datetime import timedelta

from fastapi import Response

from app.settings import settings


REFRESH_COOKIE_NAME = "refresh_token"
FINGERPRINT_COOKIE_NAME = "rf_fp"
REFRESH_COOKIE_PATH = "/auth/refresh"


def _secure() -> bool:
    # In dev we may allow insecure cookies if explicitly configured
    return bool(settings.cookie_secure)


def set_refresh_cookies(response: Response, *, refresh_token: str, rf_fp: str) -> None:
    """Set refresh cookie pair with configured TTL and flags."""
    max_age = int(settings.refresh_token_ttl_seconds)
    # httpOnly refresh
    response.set_cookie(
        key=REFRESH_COOKIE_NAME,
        value=refresh_token,
        max_age=max_age,
        expires=max_age,
        path=REFRESH_COOKIE_PATH,
        secure=_secure(),
        httponly=True,
        samesite="strict",
        domain=settings.cookie_domain or None,
    )
    # fingerprint helper for FE presence detection
    response.set_cookie(
        key=FINGERPRINT_COOKIE_NAME,
        value=rf_fp,
        max_age=max_age,
        expires=max_age,
        path=REFRESH_COOKIE_PATH,
        secure=_secure(),
        httponly=False,
        samesite="strict",
        domain=settings.cookie_domain or None,
    )


def clear_refresh_cookies(response: Response) -> None:
    """Expire refresh cookies immediately."""
    response.delete_cookie(
        key=REFRESH_COOKIE_NAME,
        path=REFRESH_COOKIE_PATH,
        domain=settings.cookie_domain or None,
    )
    response.delete_cookie(
        key=FINGERPRINT_COOKIE_NAME,
        path=REFRESH_COOKIE_PATH,
        domain=settings.cookie_domain or None,
    )
