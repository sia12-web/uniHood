"""FastAPI permission dependencies backed by RBAC."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Optional

from fastapi import Depends, HTTPException, status

from app.domain.identity import rbac
from app.infra.auth import AuthenticatedUser, get_current_user


@dataclass(slots=True)
class ACLContext:
	"""Wrapper combining the authenticated user and their RBAC snapshot."""

	user: AuthenticatedUser
	snapshot: rbac.ACLSnapshot

	def allows(self, action: str, *, campus_id: Optional[str] = None) -> bool:
		if self.user.has_role("admin"):
			return True
		target = campus_id or self.user.campus_id
		return self.snapshot.allows(action, campus_id=target)


async def get_acl_context(user: AuthenticatedUser = Depends(get_current_user)) -> ACLContext:
	"""Resolve the authenticated user and hydrate their RBAC snapshot."""

	snapshot = await rbac.get_acl_snapshot(user.id)
	return ACLContext(user=user, snapshot=snapshot)


def require_permission(action: str, *, campus_override: Optional[str] = None):
	"""Return a dependency enforcing the given permission action."""

	async def _enforce(context: ACLContext = Depends(get_acl_context)) -> AuthenticatedUser:
		campus_id = campus_override or context.user.campus_id
		if context.allows(action, campus_id=campus_id):
			return context.user
		raise HTTPException(status.HTTP_403_FORBIDDEN, detail="forbidden")

	return _enforce


async def ensure_permission(user: AuthenticatedUser, action: str, *, campus_id: Optional[str] = None) -> None:
	"""Helper for imperative permission checks inside services."""

	snapshot = await rbac.get_acl_snapshot(user.id)
	if user.has_role("admin"):
		return
	if not snapshot.allows(action, campus_id=campus_id or user.campus_id):
		raise HTTPException(status.HTTP_403_FORBIDDEN, detail="forbidden")
