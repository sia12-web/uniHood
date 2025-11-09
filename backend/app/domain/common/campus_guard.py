from __future__ import annotations

from fastapi import HTTPException, status


def require_same_campus(requested: str | None, expected: str | None) -> None:
    """Raise 403 if requested and expected campus ids are both present and differ.

    Call this from services/controllers when a user touches a resource that
    must be scoped to the user's campus.
    """
    if expected is None or requested is None:
        return
    if str(requested) != str(expected):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="cross_campus_forbidden")
