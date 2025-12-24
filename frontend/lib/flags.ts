import { getBackendUrl } from "./env";
import { readAuthSnapshot, resolveAuthHeaders } from "./auth-storage";
import type { FeatureFlagRow, FlagEvaluationResultRow, FlagOverrideRow } from "./types";

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

export async function fetchFlags(userId?: string, campusId?: string | null): Promise<FeatureFlagRow[]> {
	return request<FeatureFlagRow[]>("/flags", { userId, campusId });
}

export async function upsertFlag(
	adminId: string,
	payload: { key: string; kind: FeatureFlagRow["kind"]; description?: string; payload?: Record<string, unknown> },
	campusId?: string | null,
): Promise<FeatureFlagRow> {
	return request<FeatureFlagRow>("/flags", {
		method: "POST",
		body: {
			key: payload.key,
			kind: payload.kind,
			description: payload.description ?? "",
			payload: payload.payload ?? {},
		},
		userId: adminId,
		campusId,
	});
}

export async function deleteFlag(userId: string, key: string, campusId?: string | null): Promise<void> {
	await request<void>(`/flags/${encodeURIComponent(key)}`, {
		method: "DELETE",
		userId,
		campusId,
	});
}

type OverrideQuery = {
	userId?: string;
	campusId?: string | null;
	signal?: AbortSignal;
};

export async function fetchOverrides(
	adminId: string,
	key: string,
	query: OverrideQuery = {},
): Promise<FlagOverrideRow[]> {
	const params = new URLSearchParams();
	if (query.userId) {
		params.set("user_id", query.userId);
	}
	if (query.campusId) {
		params.set("campus_id", query.campusId);
	}
	const suffix = params.toString();
	const path = suffix ? `/flags/${encodeURIComponent(key)}/overrides?${suffix}` : `/flags/${encodeURIComponent(key)}/overrides`;
	return request<FlagOverrideRow[]>(path, {
		signal: query.signal,
		userId: adminId,
		campusId: query.campusId,
	});
}

export async function upsertOverride(
	userId: string,
	payload: { key: string; value: Record<string, unknown>; user_id?: string; campus_id?: string | null },
	campusId?: string | null,
): Promise<FlagOverrideRow> {
	return request<FlagOverrideRow>("/flags/overrides", {
		method: "POST",
		body: payload,
		userId,
		campusId,
	});
}

export async function deleteOverride(
	userId: string,
	payload: { key: string; user_id?: string; campus_id?: string | null },
	campusId?: string | null,
): Promise<void> {
	await request<void>("/flags/overrides", {
		method: "DELETE",
		body: payload,
		userId,
		campusId,
	});
}

type EvaluateOptions = {
	userId: string;
	campusId?: string | null;
	signal?: AbortSignal;
};

export async function evaluateFlag(key: string, options: EvaluateOptions): Promise<FlagEvaluationResultRow> {
	const params = new URLSearchParams();
	if (options.campusId) {
		params.set("campus_id", options.campusId);
	}
	if (options.userId) {
		params.set("user_id", options.userId);
	}
	const suffix = params.toString();
	const path = suffix ? `/flags/${encodeURIComponent(key)}/evaluate?${suffix}` : `/flags/${encodeURIComponent(key)}/evaluate`;
	return request<FlagEvaluationResultRow>(path, {
		signal: options.signal,
		userId: options.userId,
		campusId: options.campusId,
	});
}
