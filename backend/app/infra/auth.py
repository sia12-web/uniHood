"""Authentication helpers for FastAPI endpoints.

Hardening changes:
- Replace synthetic token parsing with JWT verification (HS256) using settings.secret_key.
- Gate dev headers so they are only respected in development.
- Add a reusable roles guard for FastAPI routes.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Optional, Tuple, Iterable

from fastapi import Depends, Header, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

from app.settings import settings
from app.infra import jwt as jwt_helper


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


def verify_access_jwt(token: str) -> AuthenticatedUser:
	"""Decode and validate an access JWT and return an AuthenticatedUser.

	Requirements:
	- issuer="divan-api", audience="divan-fe"
	- required claims: sub, sid, exp, iat, ver, campus_id
	- roles can be list[str] or comma-separated string.
	"""
	try:
		payload = jwt_helper.decode_access(token)
	except Exception:
		# Normalise all decode failures to invalid_token for the API surface
		raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="invalid_token")

	sub = str(payload.get("sub") or "").strip()
	campus_id = str(payload.get("campus_id") or "").strip()
	if not sub or campus_id is None:
		raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="invalid_token")

	handle = payload.get("handle")
	display_name = payload.get("name") or payload.get("display_name")
	roles_claim = payload.get("roles") or payload.get("role") or payload.get("scp")
	roles: Tuple[str, ...]
	if isinstance(roles_claim, (list, tuple)):
		roles = tuple(str(r).strip() for r in roles_claim if str(r).strip())
	elif isinstance(roles_claim, str):
		roles = tuple(part.strip() for part in roles_claim.split(",") if part.strip())
	else:
		roles = ()

	return AuthenticatedUser(
		id=sub,
		campus_id=campus_id,
		handle=str(handle) if handle is not None else None,
		display_name=str(display_name) if display_name is not None else None,
		roles=roles,
	)


async def get_current_user(
	x_user_id: Optional[str] = Header(default=None, alias="X-User-Id"),
	x_campus_id: Optional[str] = Header(default=None, alias="X-Campus-Id"),
	x_user_roles: Optional[str] = Header(default=None, alias="X-User-Roles"),
	credentials: Optional[HTTPAuthorizationCredentials] = Depends(_bearer_scheme),
) -> AuthenticatedUser:
	"""Resolve the authenticated user.
    
	In development we allow simple headers. In all other environments, headers are
	ignored and a valid Bearer JWT is required.
	"""
	# Prefer bearer JWT when present
	if credentials and credentials.scheme.lower() == "bearer":
		return verify_access_jwt(credentials.credentials)

	# In dev only, allow X-User-* fallback for local tools
	if settings.is_dev():
		if x_user_id and x_campus_id:
			roles = tuple(filter(None, (x_user_roles or "").split(","))) if x_user_roles else ()
			return AuthenticatedUser(id=x_user_id, campus_id=x_campus_id, roles=roles)

	# Otherwise, no valid auth presented
	raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="invalid_token")


async def get_admin_user(user: AuthenticatedUser = Depends(get_current_user)) -> AuthenticatedUser:
	if user.has_role("admin"):
		return user
	raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="insufficient_role")


def require_roles(*required: Iterable[str]):
	"""Return a dependency that enforces the presence of any of the given roles.

	Usage:
		@router.get("/admin", dependencies=[Depends(require_roles("admin"))])
	"""
	required_set = {str(r).strip() for r in required if str(r).strip()}

	async def _dep(user: AuthenticatedUser = Depends(get_current_user)) -> AuthenticatedUser:
		if not required_set:
			return user
		if any(user.has_role(r) for r in required_set):
			return user
		raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="insufficient_role")

	return _dep

