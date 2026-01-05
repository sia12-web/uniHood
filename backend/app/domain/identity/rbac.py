"""Role-based access control helpers."""

from __future__ import annotations

import json
from dataclasses import dataclass
from typing import Dict, Optional
from uuid import UUID, uuid4

import asyncpg
from asyncpg.exceptions import UniqueViolationError

from app.domain.identity import policy, schemas
from app.infra.postgres import get_pool
from app.infra.redis import redis_client
from app.obs import metrics as obs_metrics

def _inc_metrics(attr_name: str, *args, **kwargs) -> None:
	try:
		obj = getattr(obs_metrics, attr_name, None)
		if obj and hasattr(obj, "inc"):
			obj.inc()
		elif callable(obj):
			obj(*args, **kwargs)
	except Exception:
		pass

def _inc_labels(attr_name: str, **labels) -> None:
	try:
		obj = getattr(obs_metrics, attr_name, None)
		if obj and hasattr(obj, "labels"):
			obj.labels(**labels).inc()
	except Exception:
		pass

ACL_CACHE_TTL_SECONDS = 15 * 60


class RBACError(policy.IdentityPolicyError):
	"""Raised when RBAC operations fail."""

	pass


@dataclass(slots=True)
class ACLSnapshot:
	"""Cached snapshot of permissions resolved for a user."""

	roles: list[schemas.UserRoleOut]
	global_permissions: set[str]
	scoped_permissions: dict[str, set[str]]

	def allows(self, action: str, *, campus_id: Optional[str]) -> bool:
		if action in self.global_permissions:
			return True
		if campus_id and action in self.scoped_permissions.get(str(campus_id), set()):
			return True
		return False


def _acl_cache_key(user_id: str) -> str:
	return f"acl:user:{user_id}"


def _serialize_acl(snapshot: ACLSnapshot) -> str:
	payload = {
		"roles": [role.model_dump(mode="json") for role in snapshot.roles],
		"global": sorted(snapshot.global_permissions),
		"scoped": {campus: sorted(perms) for campus, perms in snapshot.scoped_permissions.items()},
	}
	return json.dumps(payload)


def _deserialize_acl(raw: str) -> ACLSnapshot:
	data = json.loads(raw)
	roles = [schemas.UserRoleOut(**item) for item in data.get("roles", [])]
	global_permissions = set(data.get("global", []))
	scoped_permissions = {str(campus): set(perms) for campus, perms in data.get("scoped", {}).items()}
	return ACLSnapshot(roles=roles, global_permissions=global_permissions, scoped_permissions=scoped_permissions)


async def _fetch_role(conn: asyncpg.Connection, role_id: UUID) -> schemas.RoleOut:
	rows = await conn.fetch(
		"""
		SELECT r.id, r.name, r.description, r.created_at,
		       p.id AS permission_id, p.action AS permission_action, p.description AS permission_description
		FROM roles r
		LEFT JOIN role_permissions rp ON rp.role_id = r.id
		LEFT JOIN permissions p ON p.id = rp.permission_id
		WHERE r.id = $1
		ORDER BY p.action ASC NULLS LAST
		""",
		role_id,
	)
	if not rows:
		raise RBACError("role_not_found")
	permissions: list[schemas.PermissionOut] = []
	seen: set[UUID] = set()
	role_row = rows[0]
	for row in rows:
		perm_id = row.get("permission_id")
		if perm_id and perm_id not in seen:
			permissions.append(
				schemas.PermissionOut(
					id=row["permission_id"],
					action=row["permission_action"],
					description=row.get("permission_description", ""),
				)
			)
			seen.add(perm_id)
	return schemas.RoleOut(
		id=role_row["id"],
		name=role_row["name"],
		description=role_row.get("description", ""),
		created_at=role_row["created_at"],
		permissions=permissions,
	)


async def _invalidate_users_with_role(conn: asyncpg.Connection, role_id: UUID) -> None:
	rows = await conn.fetch("SELECT DISTINCT user_id FROM user_roles WHERE role_id = $1", role_id)
	if not rows:
		return
	keys = [_acl_cache_key(str(row["user_id"])) for row in rows]
	await redis_client.delete(*keys)


async def _build_acl_from_db(user_id: str) -> ACLSnapshot:
	payload_roles: list[schemas.UserRoleOut] = []
	global_permissions: set[str] = set()
	scoped_permissions: dict[str, set[str]] = {}
	pool = await get_pool()
	async with pool.acquire() as conn:
		rows = await conn.fetch(
			"""
			SELECT ur.user_id, ur.role_id, ur.campus_id, ur.granted_by, ur.created_at,
			       r.name AS role_name,
			       p.action AS permission_action
			FROM user_roles ur
			JOIN roles r ON r.id = ur.role_id
			LEFT JOIN role_permissions rp ON rp.role_id = ur.role_id
			LEFT JOIN permissions p ON p.id = rp.permission_id
			WHERE ur.user_id = $1
			ORDER BY ur.created_at DESC
			""",
			user_id,
		)
		seen_roles: dict[tuple[UUID, Optional[UUID]], schemas.UserRoleOut] = {}
		for row in rows:
			campus_id = row.get("campus_id")
			key = (row["role_id"], campus_id)
			if key not in seen_roles:
				payload_roles.append(
					schemas.UserRoleOut(
						role_id=row["role_id"],
						role_name=row["role_name"],
						campus_id=campus_id,
						granted_by=row.get("granted_by"),
						created_at=row["created_at"],
					)
				)
				seen_roles[key] = payload_roles[-1]
			action = row.get("permission_action")
			if not action:
				continue
			if campus_id:
				scoped_permissions.setdefault(str(campus_id), set()).add(action)
			else:
				global_permissions.add(action)
	return ACLSnapshot(roles=payload_roles, global_permissions=global_permissions, scoped_permissions=scoped_permissions)


async def get_acl_snapshot(user_id: str) -> ACLSnapshot:
	key = _acl_cache_key(user_id)
	cached = await redis_client.get(key)
	if cached:
		obs_metrics.ACL_CACHE_HITS.inc()
		if isinstance(cached, bytes):
			cached = cached.decode("utf-8")
		return _deserialize_acl(cached)
	obs_metrics.ACL_CACHE_MISSES.inc()
	snapshot = await _build_acl_from_db(user_id)
	await redis_client.set(key, _serialize_acl(snapshot), ex=ACL_CACHE_TTL_SECONDS)
	return snapshot


async def user_has_permission(user_id: str, action: str, *, campus_id: Optional[str]) -> bool:
	snapshot = await get_acl_snapshot(user_id)
	return snapshot.allows(action, campus_id=campus_id)


async def invalidate_acl_cache(user_id: str) -> None:
	await redis_client.delete(_acl_cache_key(user_id))


async def list_permissions() -> list[schemas.PermissionOut]:
	pool = await get_pool()
	async with pool.acquire() as conn:
		rows = await conn.fetch("SELECT id, action, description FROM permissions ORDER BY action ASC")
	return [schemas.PermissionOut(id=row["id"], action=row["action"], description=row.get("description", "")) for row in rows]


async def list_roles() -> list[schemas.RoleOut]:
	pool = await get_pool()
	async with pool.acquire() as conn:
		rows = await conn.fetch(
			"""
			SELECT r.id, r.name, r.description, r.created_at,
			       p.id AS permission_id, p.action AS permission_action, p.description AS permission_description
			FROM roles r
			LEFT JOIN role_permissions rp ON rp.role_id = r.id
			LEFT JOIN permissions p ON p.id = rp.permission_id
			ORDER BY r.name ASC, p.action ASC NULLS LAST
			""",
		)
	role_map: Dict[UUID, dict] = {}
	for row in rows:
		role_id = row["id"]
		entry = role_map.setdefault(
			role_id,
			{
				"role": schemas.RoleOut(
					id=row["id"],
					name=row["name"],
					description=row.get("description", ""),
					created_at=row["created_at"],
					permissions=[],
				),
				"seen": set(),
			},
		)
		perm_id = row.get("permission_id")
		if perm_id and perm_id not in entry["seen"]:
			entry["role"].permissions.append(
				schemas.PermissionOut(
					id=row["permission_id"],
					action=row["permission_action"],
					description=row.get("permission_description", ""),
				)
			)
			entry["seen"].add(perm_id)
	return [bucket["role"] for bucket in sorted(role_map.values(), key=lambda item: item["role"].name)]


async def create_role(payload: schemas.RoleCreateRequest) -> schemas.RoleOut:
	pool = await get_pool()
	async with pool.acquire() as conn:
		try:
			row = await conn.fetchrow(
				"""
				INSERT INTO roles (id, name, description)
				VALUES ($1, $2, $3)
				RETURNING id, name, description, created_at
				""",
				uuid4(),
				payload.name,
				payload.description or "",
			)
		except UniqueViolationError as exc:
			raise RBACError("role_exists") from exc
	return schemas.RoleOut(
		id=row["id"],
		name=row["name"],
		description=row.get("description", ""),
		created_at=row["created_at"],
		permissions=[],
	)


async def delete_role(role_id: UUID) -> None:
	pool = await get_pool()
	async with pool.acquire() as conn:
		async with conn.transaction():
			role = await conn.fetchrow("SELECT id FROM roles WHERE id = $1", role_id)
			if not role:
				raise RBACError("role_not_found")
			await _invalidate_users_with_role(conn, role_id)
			await conn.execute("DELETE FROM role_permissions WHERE role_id = $1", role_id)
			await conn.execute("DELETE FROM user_roles WHERE role_id = $1", role_id)
			await conn.execute("DELETE FROM roles WHERE id = $1", role_id)


async def add_permission_to_role(role_id: UUID, permission_id: UUID, *, actor_id: str) -> schemas.RoleOut:
	await policy.enforce_rbac_grant_rate(actor_id)
	pool = await get_pool()
	async with pool.acquire() as conn:
		async with conn.transaction():
			role_exists = await conn.fetchrow("SELECT id FROM roles WHERE id = $1", role_id)
			if not role_exists:
				raise RBACError("role_not_found")
			perm_exists = await conn.fetchrow("SELECT id, action FROM permissions WHERE id = $1", permission_id)
			if not perm_exists:
				raise RBACError("permission_not_found")
			await conn.execute(
				"""
				INSERT INTO role_permissions (role_id, permission_id)
				VALUES ($1, $2)
				ON CONFLICT DO NOTHING
				""",
				role_id,
				permission_id,
			)
			await _invalidate_users_with_role(conn, role_id)
			obs_metrics.RBAC_ROLE_GRANTS.labels(role=str(role_id), permission=perm_exists["action"]).inc()
			return await _fetch_role(conn, role_id)


async def remove_permission_from_role(role_id: UUID, permission_id: UUID, *, actor_id: str) -> schemas.RoleOut:
	await policy.enforce_rbac_grant_rate(actor_id)
	pool = await get_pool()
	async with pool.acquire() as conn:
		async with conn.transaction():
			role_exists = await conn.fetchrow("SELECT id FROM roles WHERE id = $1", role_id)
			if not role_exists:
				raise RBACError("role_not_found")
			await conn.execute(
				"DELETE FROM role_permissions WHERE role_id = $1 AND permission_id = $2",
				role_id,
				permission_id,
			)
			await _invalidate_users_with_role(conn, role_id)
			return await _fetch_role(conn, role_id)


async def list_user_roles(user_id: str) -> list[schemas.UserRoleOut]:
	snapshot = await get_acl_snapshot(user_id)
	return snapshot.roles


async def grant_role(
	user_id: str,
	request: schemas.UserRoleGrantRequest,
	*,
	actor_id: str,
	campus_id: Optional[str],
	granted_by: Optional[str] = None,
) -> list[schemas.UserRoleOut]:
	await policy.enforce_rbac_grant_rate(actor_id)
	pool = await get_pool()
	async with pool.acquire() as conn:
		async with conn.transaction():
			role_row = await conn.fetchrow("SELECT id, name FROM roles WHERE id = $1", request.role_id)
			if not role_row:
				raise RBACError("role_not_found")
			user_exists = await conn.fetchval("SELECT 1 FROM users WHERE id = $1", user_id)
			if not user_exists:
				raise RBACError("user_not_found")
			scope = request.campus_id or campus_id
			await conn.execute(
				"""
				INSERT INTO user_roles (user_id, role_id, campus_id, granted_by)
				VALUES ($1, $2, $3, $4)
				ON CONFLICT (user_id, role_id, campus_id)
				DO UPDATE SET granted_by = EXCLUDED.granted_by, created_at = NOW()
				""",
				user_id,
				request.role_id,
				scope,
				granted_by or actor_id,
			)
			_inc_labels("RBAC_USER_GRANTS", role=role_row["name"], scope=str(scope or "global"))
			
			# v2 Security: Log Critical Action
			from app.domain.identity import audit
			await audit.log_event(
				"role_granted", 
				user_id=actor_id, # The admin who performed the action
				meta={
					"target_user_id": user_id, 
					"role": role_row["name"], 
					"scope": str(scope or "global")
				}
			)

	await invalidate_acl_cache(user_id)
	
	# v2 Security: Revoke tokens to force re-auth/new claims
	# This ensures the new role is reflected immediately and checks/balances are reset
	from app.domain.identity import service
	await service.revoke_user_tokens(user_id)
	
	return await list_user_roles(user_id)


async def revoke_role(
	user_id: str,
	request: schemas.UserRoleRevokeRequest,
	*,
	actor_id: str,
	campus_id: Optional[str],
) -> list[schemas.UserRoleOut]:
	await policy.enforce_rbac_grant_rate(actor_id)
	pool = await get_pool()
	async with pool.acquire() as conn:
		scope = request.campus_id or campus_id
		# Fetch role name for audit before deleting
		role_name = await conn.fetchval(
			"""
			SELECT r.name FROM roles r 
			JOIN user_roles ur ON ur.role_id = r.id 
			WHERE ur.user_id = $1 AND ur.role_id = $2 AND (ur.campus_id IS NOT DISTINCT FROM $3)
			""", 
			user_id, request.role_id, scope
		)
		
		result = await conn.execute(
			"""
			DELETE FROM user_roles
			WHERE user_id = $1
			  AND role_id = $2
			  AND (campus_id IS NOT DISTINCT FROM $3)
			""",
			user_id,
			request.role_id,
			scope,
		)
	if result.endswith("0"):
		raise RBACError("role_not_assigned")
		
	# v2 Security: Log Critical Action
	from app.domain.identity import audit
	await audit.log_event(
		"role_revoked", 
		user_id=actor_id, # The admin who performed the action
		meta={
			"target_user_id": user_id, 
			"role": role_name or str(request.role_id), 
			"scope": str(scope or "global")
		}
	)
		
	await invalidate_acl_cache(user_id)
	
	# v2 Security: Revoke tokens
	from app.domain.identity import service
	await service.revoke_user_tokens(user_id)
	
	return await list_user_roles(user_id)
