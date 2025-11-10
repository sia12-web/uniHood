from __future__ import annotations

from typing import Any, Iterable, Optional

from fastapi import Depends, HTTPException, status

from app.domain.identity import middleware_acl
from app.infra.auth import AuthenticatedUser, get_current_user


def _normalise_roles(values: Iterable[str]) -> tuple[str, ...]:
    return tuple(sorted({str(role).strip() for role in values if str(role).strip()}))


def require_roles(*roles: str):
    required = _normalise_roles(roles)

    async def _dep(user: AuthenticatedUser = Depends(get_current_user)) -> AuthenticatedUser:
        if not required:
            return user
        if user.has_role("admin"):
            return user
        if any(user.has_role(role) for role in required):
            return user
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="forbidden")

    return _dep


def require_same_campus(target_campus_id: Optional[Any], user: AuthenticatedUser) -> None:
    if user.has_role("admin"):
        return
    if target_campus_id is None:
        return
    if str(user.campus_id) != str(target_campus_id):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="cross_campus_forbidden")


def require_perms(*perms: str, campus_override: Optional[Any] = None):
    required = tuple(str(perm).strip() for perm in perms if str(perm).strip())

    async def _dep(context: middleware_acl.ACLContext = Depends(middleware_acl.get_acl_context)) -> AuthenticatedUser:
        user = context.user
        if not required or user.has_role("admin"):
            return user
        campus_id = campus_override or user.campus_id
        campus_key = str(campus_id) if campus_id is not None else None
        for perm in required:
            if not context.allows(perm, campus_id=campus_key):
                raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="forbidden")
        return user

    return _dep
