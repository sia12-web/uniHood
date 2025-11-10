import { apiFetch, type ApiFetchOptions } from "@/app/lib/http/client";
import { getBackendUrl } from "./env";
import type {
	AuditLogItem,
	BlockEntry,
	DeletionStatus,
	ExportStatus,
	NotificationPrefs,
	ProfilePrivacy,
} from "./types";

const BASE_URL = getBackendUrl();

async function request<T>(path: string, options: ApiFetchOptions = {}): Promise<T> {
	return apiFetch<T>(`${BASE_URL}${path}`, {
		cache: "no-store",
		...options,
	});
}

function authHeaders(userId: string, campusId: string | null): Record<string, string> {
	return {
		"X-User-Id": userId,
		...(campusId ? { "X-Campus-Id": campusId } : {}),
	};
}

export type PrivacyPatchPayload = Partial<Omit<ProfilePrivacy, "visibility">> & {
	visibility?: ProfilePrivacy["visibility"];
};

export type NotificationPatchPayload = Partial<NotificationPrefs>;

export type AuditLogPage = {
	items: AuditLogItem[];
	cursor?: number | null;
};

export async function fetchPrivacySettings(userId: string, campusId: string | null): Promise<ProfilePrivacy> {
	return request<ProfilePrivacy>("/settings/privacy", { headers: authHeaders(userId, campusId) });
}

export async function updatePrivacySettings(
	userId: string,
	campusId: string | null,
	patch: PrivacyPatchPayload,
): Promise<ProfilePrivacy> {
	return request<ProfilePrivacy>("/settings/privacy", {
		method: "PATCH",
		body: patch,
		headers: authHeaders(userId, campusId),
	});
}

export async function listBlocks(userId: string, campusId: string | null): Promise<BlockEntry[]> {
	return request<BlockEntry[]>("/privacy/blocks", { headers: authHeaders(userId, campusId) });
}

export async function blockUser(userId: string, campusId: string | null, targetId: string): Promise<BlockEntry> {
	return request<BlockEntry>(`/privacy/block/${targetId}`, {
		method: "POST",
		headers: authHeaders(userId, campusId),
	});
}

export async function unblockUser(userId: string, campusId: string | null, targetId: string): Promise<void> {
	await request<void>(`/privacy/block/${targetId}`, {
		method: "DELETE",
		headers: authHeaders(userId, campusId),
	});
}

export async function fetchNotificationPrefs(
	userId: string,
	campusId: string | null,
): Promise<NotificationPrefs> {
	return request<NotificationPrefs>("/settings/notifications", { headers: authHeaders(userId, campusId) });
}

export async function updateNotificationPrefs(
	userId: string,
	campusId: string | null,
	patch: NotificationPatchPayload,
): Promise<NotificationPrefs> {
	return request<NotificationPrefs>("/settings/notifications", {
		method: "PATCH",
		body: patch,
		headers: authHeaders(userId, campusId),
	});
}

export async function requestExportJob(userId: string, campusId: string | null): Promise<ExportStatus> {
	return request<ExportStatus>("/account/export/request", {
		method: "POST",
		headers: authHeaders(userId, campusId),
	});
}

export async function fetchExportStatus(userId: string, campusId: string | null): Promise<ExportStatus> {
	return request<ExportStatus>("/account/export/status", { headers: authHeaders(userId, campusId) });
}

export async function fetchExportDownload(userId: string, campusId: string | null): Promise<ExportStatus> {
	return request<ExportStatus>("/account/export/download", { headers: authHeaders(userId, campusId) });
}

export async function requestDeletion(userId: string, campusId: string | null): Promise<DeletionStatus> {
	return request<DeletionStatus>("/account/delete/request", {
		method: "POST",
		headers: authHeaders(userId, campusId),
	});
}

export async function confirmDeletion(
	userId: string,
	campusId: string | null,
	token: string,
): Promise<DeletionStatus> {
	return request<DeletionStatus>("/account/delete/confirm", {
		method: "POST",
		body: { token },
		headers: authHeaders(userId, campusId),
	});
}

export async function fetchDeletionStatus(userId: string, campusId: string | null): Promise<DeletionStatus> {
	return request<DeletionStatus>("/account/delete/status", {
		headers: authHeaders(userId, campusId),
	});
}

export async function fetchAuditLog(
	userId: string,
	campusId: string | null,
	params: { limit?: number; cursor?: number | null } = {},
): Promise<AuditLogPage> {
	const query = new URLSearchParams();
	if (params.limit) {
		query.set("limit", String(params.limit));
	}
	if (params.cursor) {
		query.set("cursor", String(params.cursor));
	}
	const suffix = query.toString() ? `?${query.toString()}` : "";
	return request<AuditLogPage>(`/account/audit${suffix}`, {
		headers: authHeaders(userId, campusId),
	});
}
