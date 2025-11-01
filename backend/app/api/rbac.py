"""RBAC API endpoints for managing roles, permissions, and user grants."""

from __future__ import annotations

from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status

from app.domain.identity import middleware_acl, policy, rbac, schemas
from app.infra.auth import AuthenticatedUser, get_current_user

router = APIRouter(prefix="/rbac", tags=["rbac"])

PERMISSION_MANAGE = "identity.rbac.manage"
PERMISSION_GRANT = "identity.rbac.grant"


def _map_error(exc: policy.IdentityPolicyError) -> HTTPException:
	reason = getattr(exc, "reason", "invalid")
	if isinstance(exc, policy.IdentityRateLimitExceeded):
		return HTTPException(status.HTTP_429_TOO_MANY_REQUESTS, detail=reason)
	if reason in {"role_not_found", "permission_not_found", "user_not_found"}:
		return HTTPException(status.HTTP_404_NOT_FOUND, detail=reason)
	if reason in {"role_exists"}:
		return HTTPException(status.HTTP_409_CONFLICT, detail=reason)
	return HTTPException(status.HTTP_400_BAD_REQUEST, detail=reason)


@router.get("/permissions", response_model=list[schemas.PermissionOut])
async def get_permissions(_: AuthenticatedUser = Depends(middleware_acl.require_permission(PERMISSION_MANAGE))) -> list[schemas.PermissionOut]:
	return await rbac.list_permissions()


@router.get("/roles", response_model=list[schemas.RoleOut])
async def get_roles(_: AuthenticatedUser = Depends(middleware_acl.require_permission(PERMISSION_MANAGE))) -> list[schemas.RoleOut]:
	return await rbac.list_roles()


@router.post("/roles", response_model=schemas.RoleOut, status_code=status.HTTP_201_CREATED)
async def create_role(
	payload: schemas.RoleCreateRequest,
	_: AuthenticatedUser = Depends(middleware_acl.require_permission(PERMISSION_MANAGE)),
) -> schemas.RoleOut:
	try:
		return await rbac.create_role(payload)
	except policy.IdentityPolicyError as exc:  # pragma: no cover - handled by helper
		raise _map_error(exc) from exc


@router.delete("/roles/{role_id}", status_code=status.HTTP_200_OK)
async def delete_role_endpoint(
	role_id: UUID,
	_: AuthenticatedUser = Depends(middleware_acl.require_permission(PERMISSION_MANAGE)),
) -> None:
	try:
		await rbac.delete_role(role_id)
	except policy.IdentityPolicyError as exc:
		raise _map_error(exc) from exc
	return {"status": "ok"}


@router.post("/roles/{role_id}/permissions/{permission_id}", response_model=schemas.RoleOut)
async def attach_permission(
	role_id: UUID,
	permission_id: UUID,
	actor: AuthenticatedUser = Depends(middleware_acl.require_permission(PERMISSION_MANAGE)),
) -> schemas.RoleOut:
	try:
		return await rbac.add_permission_to_role(role_id, permission_id, actor_id=actor.id)
	except policy.IdentityPolicyError as exc:
		raise _map_error(exc) from exc


@router.delete("/roles/{role_id}/permissions/{permission_id}", response_model=schemas.RoleOut)
async def detach_permission(
	role_id: UUID,
	permission_id: UUID,
	actor: AuthenticatedUser = Depends(middleware_acl.require_permission(PERMISSION_MANAGE)),
) -> schemas.RoleOut:
	try:
		return await rbac.remove_permission_from_role(role_id, permission_id, actor_id=actor.id)
	except policy.IdentityPolicyError as exc:
		raise _map_error(exc) from exc


@router.get("/me/roles", response_model=list[schemas.UserRoleOut])
async def my_roles(context: middleware_acl.ACLContext = Depends(middleware_acl.get_acl_context)) -> list[schemas.UserRoleOut]:
	return context.snapshot.roles


@router.get("/users/{user_id}/roles", response_model=list[schemas.UserRoleOut])
async def list_user_roles(
	user_id: str,
	actor: AuthenticatedUser = Depends(middleware_acl.require_permission(PERMISSION_GRANT)),
) -> list[schemas.UserRoleOut]:
	return await rbac.list_user_roles(user_id)


@router.post("/users/{user_id}/roles", response_model=list[schemas.UserRoleOut])
async def grant_role_endpoint(
	user_id: str,
	payload: schemas.UserRoleGrantRequest,
	actor: AuthenticatedUser = Depends(middleware_acl.require_permission(PERMISSION_GRANT)),
) -> list[schemas.UserRoleOut]:
	try:
		return await rbac.grant_role(
			user_id,
			payload,
			actor_id=actor.id,
			campus_id=actor.campus_id,
			granted_by=actor.id,
		)
	except policy.IdentityPolicyError as exc:
		raise _map_error(exc) from exc


@router.delete("/users/{user_id}/roles", response_model=list[schemas.UserRoleOut])
async def revoke_role_endpoint(
	user_id: str,
	payload: schemas.UserRoleRevokeRequest,
	actor: AuthenticatedUser = Depends(middleware_acl.require_permission(PERMISSION_GRANT)),
) -> list[schemas.UserRoleOut]:
	try:
		return await rbac.revoke_role(user_id, payload, actor_id=actor.id, campus_id=actor.campus_id)
	except policy.IdentityPolicyError as exc:
		raise _map_error(exc) from exc


@router.get("/check/{action}", response_model=dict)
async def check_permission(
	action: str,
	user: AuthenticatedUser = Depends(get_current_user),
) -> dict[str, bool]:
	allowed = await rbac.user_has_permission(user.id, action, campus_id=user.campus_id)
	return {"allowed": allowed or user.has_role("admin")}
