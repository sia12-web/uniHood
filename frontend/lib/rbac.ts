import { getBackendUrl } from "./env";
import { readAuthSnapshot, resolveAuthHeaders } from "./auth-storage";
import type { PermissionRow, RoleRow, UserRoleRow } from "./types";

type HttpMethod = "GET" | "POST" | "DELETE";

type RequestOptions = {
	method?: HttpMethod;
	body?: unknown;
	signal?: AbortSignal;
	userId?: string;
	campusId?: string | null;
};

const BASE_URL = getBackendUrl();

async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
	const { method = "GET", body, signal, userId, campusId } = options;

	const snapshot = readAuthSnapshot();
	const authHeaders = resolveAuthHeaders(snapshot);

	const headers: Record<string, string> = {
		...authHeaders,
		"Content-Type": "application/json",
	};

	if (userId) headers["X-User-Id"] = userId;
	if (campusId) headers["X-Campus-Id"] = campusId;

	const response = await fetch(`${BASE_URL}${path}`, {
		method,
		headers,
		body: body ? JSON.stringify(body) : undefined,
		signal,
		credentials: "include",
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

export async function fetchPermissions(adminId?: string, campusId?: string | null): Promise<PermissionRow[]> {
	return request<PermissionRow[]>("/rbac/permissions", { userId: adminId, campusId });
}

export async function fetchRoles(adminId?: string, campusId?: string | null): Promise<RoleRow[]> {
	return request<RoleRow[]>("/rbac/roles", { userId: adminId, campusId });
}

export async function createRole(
	adminId: string,
	payload: { name: string; description?: string | null },
	campusId?: string | null,
): Promise<RoleRow> {
	return request<RoleRow>("/rbac/roles", {
		method: "POST",
		body: { name: payload.name, description: payload.description ?? "" },
		userId: adminId,
		campusId,
	});
}

export async function deleteRole(adminId: string, roleId: string, campusId?: string | null): Promise<void> {
	await request<void>(`/rbac/roles/${roleId}`, {
		method: "DELETE",
		userId: adminId,
		campusId,
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
		campusId,
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
		campusId,
	});
}

export async function fetchUserRoles(
	targetUserId: string,
	actorId: string,
	campusId?: string | null,
): Promise<UserRoleRow[]> {
	if (targetUserId === actorId) {
		return request<UserRoleRow[]>("/rbac/me/roles", { userId: actorId, campusId });
	}
	return request<UserRoleRow[]>(`/rbac/users/${targetUserId}/roles`, { userId: actorId, campusId });
}

export async function grantRole(
	actorId: string,
	targetUserId: string,
	payload: { role_id: string; campus_id?: string | null },
	campusId?: string | null,
): Promise<UserRoleRow[]> {
	return request<UserRoleRow[]>(`/rbac/users/${targetUserId}/roles`, {
		method: "POST",
		body: {
			role_id: payload.role_id,
			campus_id: payload.campus_id ?? null,
		},
		userId: actorId,
		campusId,
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
		body: {
			role_id: payload.role_id,
			campus_id: payload.campus_id ?? null,
		},
		userId: actorId,
		campusId,
	});
}

export async function checkPermission(
	action: string,
	userId?: string,
	campusId?: string | null,
): Promise<boolean> {
	const result = await request<{ allowed: boolean }>(`/rbac/check/${encodeURIComponent(action)}`, {
		userId,
		campusId,
	});
	return Boolean(result.allowed);
}
