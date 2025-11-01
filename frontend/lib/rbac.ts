import { getBackendUrl } from "./env";
import type { PermissionRow, RoleRow, UserRoleRow } from "./types";

type HttpMethod = "GET" | "POST" | "DELETE";

type RequestOptions = {
	method?: HttpMethod;
	body?: unknown;
	userId?: string;
	campusId?: string | null;
	signal?: AbortSignal;
};

const BASE_URL = getBackendUrl();

async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
	const { method = "GET", body, userId, campusId, signal } = options;
	const headers: Record<string, string> = { "Content-Type": "application/json" };
	if (userId) {
		headers["X-User-Id"] = userId;
	}
	if (campusId) {
		headers["X-Campus-Id"] = campusId;
	}
	const response = await fetch(`${BASE_URL}${path}`, {
		method,
		headers,
		body: body ? JSON.stringify(body) : undefined,
		signal,
	});
	if (!response.ok) {
		const detail = await response.text();
		throw new Error(detail || `Request failed (${response.status})`);
	}
	if (response.status === 204) {
		return undefined as unknown as T;
	}
	return (await response.json()) as T;
}

export async function fetchPermissions(adminId: string, campusId?: string | null): Promise<PermissionRow[]> {
	return request<PermissionRow[]>("/rbac/permissions", {
		userId: adminId,
		campusId: campusId ?? null,
	});
}

export async function fetchRoles(adminId: string, campusId?: string | null): Promise<RoleRow[]> {
	return request<RoleRow[]>("/rbac/roles", {
		userId: adminId,
		campusId: campusId ?? null,
	});
}

export async function createRole(
	adminId: string,
	payload: { name: string; description?: string | null },
	campusId?: string | null,
): Promise<RoleRow> {
	return request<RoleRow>("/rbac/roles", {
		method: "POST",
		userId: adminId,
		campusId: campusId ?? null,
		body: { name: payload.name, description: payload.description ?? "" },
	});
}

export async function deleteRole(adminId: string, roleId: string, campusId?: string | null): Promise<void> {
	await request<void>(`/rbac/roles/${roleId}`, {
		method: "DELETE",
		userId: adminId,
		campusId: campusId ?? null,
	});
}

export async function attachPermission(
	adminId: string,
	roleId: string,
	permissionId: string,
	campusId?: string | null,
): Promise<RoleRow> {
	return request<RoleRow>(`/rbac/roles/${roleId}/permissions/${permissionId}`, {
		method: "POST",
		userId: adminId,
		campusId: campusId ?? null,
	});
}

export async function detachPermission(
	adminId: string,
	roleId: string,
	permissionId: string,
	campusId?: string | null,
): Promise<RoleRow> {
	return request<RoleRow>(`/rbac/roles/${roleId}/permissions/${permissionId}`, {
		method: "DELETE",
		userId: adminId,
		campusId: campusId ?? null,
	});
}

export async function fetchUserRoles(
	targetUserId: string,
	actorId: string,
	campusId?: string | null,
): Promise<UserRoleRow[]> {
	if (targetUserId === actorId) {
		return request<UserRoleRow[]>("/rbac/me/roles", {
			userId: actorId,
			campusId: campusId ?? null,
		});
	}
	return request<UserRoleRow[]>(`/rbac/users/${targetUserId}/roles`, {
		userId: actorId,
		campusId: campusId ?? null,
	});
}

export async function grantRole(
	actorId: string,
	targetUserId: string,
	payload: { role_id: string; campus_id?: string | null },
	campusId?: string | null,
): Promise<UserRoleRow[]> {
	return request<UserRoleRow[]>(`/rbac/users/${targetUserId}/roles`, {
		method: "POST",
		userId: actorId,
		campusId: campusId ?? null,
		body: {
			role_id: payload.role_id,
			campus_id: payload.campus_id ?? null,
		},
	});
}

export async function revokeRole(
	actorId: string,
	targetUserId: string,
	payload: { role_id: string; campus_id?: string | null },
	campusId?: string | null,
): Promise<UserRoleRow[]> {
	return request<UserRoleRow[]>(`/rbac/users/${targetUserId}/roles`, {
		method: "DELETE",
		userId: actorId,
		campusId: campusId ?? null,
		body: {
			role_id: payload.role_id,
			campus_id: payload.campus_id ?? null,
		},
	});
}

export async function checkPermission(
	action: string,
	userId: string,
	campusId?: string | null,
): Promise<boolean> {
	const result = await request<{ allowed: boolean }>(`/rbac/check/${encodeURIComponent(action)}`, {
		userId,
		campusId: campusId ?? null,
	});
	return Boolean(result.allowed);
}
