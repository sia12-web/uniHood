"""Centralised JWT helpers for access tokens.

Uses HS256 with the application's secret key. Validates standard claims
and expected issuer/audience values.
"""

from __future__ import annotations

import time
from typing import Any, Dict

import jwt
from jwt import InvalidTokenError

from app.settings import settings


ISSUER = "divan-api"
AUDIENCE = "divan-fe"


def encode_access(payload: dict[str, object]) -> str:
    """Encode an access token with required issuer/audience defaults."""
    now = int(time.time())
    body: Dict[str, Any] = {"iss": ISSUER, "aud": AUDIENCE, "iat": now}
    body.update(payload)
    return jwt.encode(body, settings.secret_key, algorithm="HS256")


def decode_access(token: str) -> dict[str, object]:
    """Decode and validate an access token.

    Raises jwt.InvalidTokenError subclasses on failure.
    """
    options = {"require": ["exp", "iat", "iss", "aud"]}
    payload = jwt.decode(
        token,
        settings.secret_key,
        algorithms=["HS256"],
        audience=AUDIENCE,
        issuer=ISSUER,
        leeway=5,
        options=options,
    )
    # Required app-specific claims
    for k in ("sub", "sid", "ver", "campus_id"):
        if not payload.get(k):
            raise InvalidTokenError(f"missing_claim:{k}")
    return payload  # type: ignore[return-value]
