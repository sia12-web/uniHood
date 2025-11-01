import { getBackendUrl } from "./env";
import type { FeatureFlagRow, FlagEvaluationResultRow, FlagOverrideRow } from "./types";

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

export async function fetchFlags(adminId: string, campusId?: string | null): Promise<FeatureFlagRow[]> {
	return request<FeatureFlagRow[]>("/flags", {
		userId: adminId,
		campusId: campusId ?? null,
	});
}

export async function upsertFlag(
	adminId: string,
	payload: { key: string; kind: FeatureFlagRow["kind"]; description?: string; payload?: Record<string, unknown> },
	campusId?: string | null,
): Promise<FeatureFlagRow> {
	return request<FeatureFlagRow>("/flags", {
		method: "POST",
		userId: adminId,
		campusId: campusId ?? null,
		body: {
			key: payload.key,
			kind: payload.kind,
			description: payload.description ?? "",
			payload: payload.payload ?? {},
		},
	});
}

export async function deleteFlag(adminId: string, key: string, campusId?: string | null): Promise<void> {
	await request<void>(`/flags/${encodeURIComponent(key)}`, {
		method: "DELETE",
		userId: adminId,
		campusId: campusId ?? null,
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
		userId: adminId,
		campusId: query.campusId ?? null,
		signal: query.signal,
	});
}

export async function upsertOverride(
	adminId: string,
	payload: { key: string; value: Record<string, unknown>; user_id?: string; campus_id?: string | null },
	campusId?: string | null,
): Promise<FlagOverrideRow> {
	return request<FlagOverrideRow>("/flags/overrides", {
		method: "POST",
		userId: adminId,
		campusId: campusId ?? null,
		body: payload,
	});
}

export async function deleteOverride(
	adminId: string,
	payload: { key: string; user_id?: string; campus_id?: string | null },
	campusId?: string | null,
): Promise<void> {
	await request<void>("/flags/overrides", {
		method: "DELETE",
		userId: adminId,
		campusId: campusId ?? null,
		body: payload,
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
	const suffix = params.toString();
	const path = suffix ? `/flags/${encodeURIComponent(key)}/evaluate?${suffix}` : `/flags/${encodeURIComponent(key)}/evaluate`;
	return request<FlagEvaluationResultRow>(path, {
		userId: options.userId,
		campusId: options.campusId ?? null,
		signal: options.signal,
	});
}
