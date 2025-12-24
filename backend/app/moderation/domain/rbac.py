"""RBAC utilities for moderation staff endpoints."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Iterable, Sequence

from fastapi import HTTPException, status

from app.infra.auth import AuthenticatedUser

STAFF_MODERATOR_SCOPE = "staff.moderator"
STAFF_ADMIN_SCOPE = "staff.admin"


@dataclass(slots=True)
class StaffContext:
    """Resolved staff RBAC context used throughout the admin API."""

    user: AuthenticatedUser
    scopes: tuple[str, ...]
    allowed_campuses: tuple[str, ...]

    @property
    def actor_id(self) -> str:
        return self.user.id

    @property
    def is_admin(self) -> bool:
        return STAFF_ADMIN_SCOPE in self.scopes or "admin" in self.scopes

    @property
    def is_moderator(self) -> bool:
        return STAFF_MODERATOR_SCOPE in self.scopes or self.is_admin


def resolve_staff_context(user: AuthenticatedUser, *, campus_ids: Sequence[str] | None = None) -> StaffContext:
    """Return the staff context while applying optional request campus scoping."""

    scopes: tuple[str, ...] = tuple(user.roles)
    # Support both subsystem-specific 'staff' roles and the global 'admin' role
    is_global_admin = "admin" in scopes
    if not scopes or (STAFF_ADMIN_SCOPE not in scopes and STAFF_MODERATOR_SCOPE not in scopes and not is_global_admin):
        raise HTTPException(status.HTTP_403_FORBIDDEN, detail="staff_scope_required")
    
    if STAFF_ADMIN_SCOPE in scopes or is_global_admin:
        allowed = tuple(campus_ids) if campus_ids else tuple()
    else:
        base = tuple(filter(None, (user.campus_id,)))
        if campus_ids:
            intersection = [cid for cid in campus_ids if cid in base]
            if not intersection:
                raise HTTPException(status.HTTP_403_FORBIDDEN, detail="campus_forbidden")
            allowed = tuple(intersection)
        else:
            allowed = base
    return StaffContext(user=user, scopes=scopes, allowed_campuses=allowed)


def restrict_campuses(context: StaffContext, campuses: Iterable[str] | None) -> tuple[str, ...]:
    """Return the campuses a query should be limited to.

    Admins can query any campus; moderators are limited to their resolved campuses.
    When ``campuses`` is empty the moderator campuses are used. For admins an empty
    tuple means "no campus restriction".
    """

    if context.is_admin:
        return tuple(campuses) if campuses else tuple()
    allowed = set(context.allowed_campuses)
    if not allowed:
        raise HTTPException(status.HTTP_403_FORBIDDEN, detail="campus_required")
    if campuses:
        intersection = tuple(cid for cid in campuses if cid in allowed)
        if not intersection:
            raise HTTPException(status.HTTP_403_FORBIDDEN, detail="campus_forbidden")
        return intersection
    return tuple(allowed)


def ensure_action_permission(context: StaffContext, *, action: str) -> None:
    """Validate that the actor can perform a batch action."""

    if not context.is_moderator:
        raise HTTPException(status.HTTP_403_FORBIDDEN, detail="moderator_required")
    if action == "apply_enforcement" and not context.is_admin:
        raise HTTPException(status.HTTP_403_FORBIDDEN, detail="admin_required")
