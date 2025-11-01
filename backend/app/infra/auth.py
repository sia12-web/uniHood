"""Authentication helpers for FastAPI endpoints."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Optional, Tuple

from fastapi import Depends, Header, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer


@dataclass(slots=True)
class AuthenticatedUser:
	id: str
	campus_id: str
	handle: Optional[str] = None
	display_name: Optional[str] = None
	roles: Tuple[str, ...] = ()

	def has_role(self, role: str) -> bool:
		return role in self.roles


_bearer_scheme = HTTPBearer(auto_error=False)


def _parse_token(token: str) -> AuthenticatedUser:
	"""Parse a very small synthetic token format used for Phase 1.

	Expected format: ``uid:<user_id>;campus:<campus_id>;handle:<optional>``.
	"""

	parts = {}
	for fragment in token.split(";"):
		if not fragment:
			continue
		if ":" not in fragment:
			continue
		key, value = fragment.split(":", 1)
		parts[key] = value
	if "uid" not in parts or "campus" not in parts:
		raise ValueError("token missing uid/campus")
	roles_value = parts.get("roles") or parts.get("role")
	roles: Tuple[str, ...] = tuple(filter(None, (roles_value or "").split(","))) if roles_value else ()
	return AuthenticatedUser(
		id=parts["uid"],
		campus_id=parts["campus"],
		handle=parts.get("handle"),
		display_name=parts.get("name"),
		roles=roles,
	)


async def get_current_user(
	x_user_id: Optional[str] = Header(default=None, alias="X-User-Id"),
	x_campus_id: Optional[str] = Header(default=None, alias="X-Campus-Id"),
	x_user_roles: Optional[str] = Header(default=None, alias="X-User-Roles"),
	credentials: Optional[HTTPAuthorizationCredentials] = Depends(_bearer_scheme),
) -> AuthenticatedUser:
	"""Resolve the authenticated user.

	For local development we allow simple headers. Production clients should use
	bearer tokens following the synthetic schema handled by ``_parse_token``.
	"""

	if x_user_id and x_campus_id:
		roles = tuple(filter(None, (x_user_roles or "").split(","))) if x_user_roles else ()
		return AuthenticatedUser(id=x_user_id, campus_id=x_campus_id, roles=roles)
	if credentials and credentials.scheme.lower() == "bearer":
		try:
			return _parse_token(credentials.credentials)
		except ValueError as exc:
			raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail=str(exc)) from exc
	raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="missing authentication")


async def get_admin_user(user: AuthenticatedUser = Depends(get_current_user)) -> AuthenticatedUser:
	if user.has_role("admin"):
		return user
	raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="admin_required")

