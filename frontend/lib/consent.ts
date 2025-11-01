import { getBackendUrl } from "./env";
import type { ConsentGateResponse, ConsentRecordRow, PolicyDocumentRow } from "./types";

type HttpMethod = "GET" | "POST";

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

export async function fetchPolicies(signal?: AbortSignal): Promise<PolicyDocumentRow[]> {
	return request<PolicyDocumentRow[]>("/consent/policies", { signal });
}

type PolicyQuery = {
	version?: string;
	signal?: AbortSignal;
};

export async function fetchPolicy(slug: string, query: PolicyQuery = {}): Promise<PolicyDocumentRow> {
	const params = new URLSearchParams();
	if (query.version) {
		params.set("version", query.version);
	}
	const suffix = params.toString();
	const path = suffix ? `/consent/policies/${slug}?${suffix}` : `/consent/policies/${slug}`;
	return request<PolicyDocumentRow>(path, { signal: query.signal });
}

export async function fetchUserConsents(userId: string, campusId?: string | null): Promise<ConsentRecordRow[]> {
	return request<ConsentRecordRow[]>("/consent/me", {
		userId,
		campusId: campusId ?? null,
	});
}

export async function acceptConsent(
	userId: string,
	payload: { slug: string; version: string; accepted: boolean; meta?: Record<string, unknown> },
	campusId?: string | null,
): Promise<ConsentRecordRow[]> {
	return request<ConsentRecordRow[]>("/consent/me", {
		method: "POST",
		userId,
		campusId: campusId ?? null,
		body: payload,
	});
}

export async function fetchConsentGate(userId: string, campusId?: string | null): Promise<ConsentGateResponse> {
	return request<ConsentGateResponse>("/consent/gate", {
		userId,
		campusId: campusId ?? null,
	});
}
