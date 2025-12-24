import { getBackendUrl } from "./env";
import { readAuthSnapshot, resolveAuthHeaders } from "./auth-storage";
import type {
	AdminVerificationDecision,
	TrustProfileSummary,
	VerificationDocPresign,
	VerificationEntry,
	VerificationSsoStart,
	VerificationStatus,
} from "./types";

type HttpMethod = "GET" | "POST";

const BASE_URL = getBackendUrl();

type RequestOptions = {
	method?: HttpMethod;
	body?: unknown;
	signal?: AbortSignal;
	userId?: string;
	campusId?: string | null;
};

async function decodeError(response: Response): Promise<never> {
	let message = `Request failed (${response.status})`;
	try {
		const data = await response.json();
		if (typeof data === "string") {
			message = data;
		} else if (data?.detail) {
			message = typeof data.detail === "string" ? data.detail : JSON.stringify(data.detail);
		}
	} catch {
		try {
			const text = await response.text();
			if (text) {
				message = text;
			}
		} catch {
			// fall through
		}
	}
	throw new Error(message);
}

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
		await decodeError(response);
	}
	if (response.status === 204) {
		return undefined as unknown as T;
	}
	if (response.headers.get("Content-Length") === "0") {
		return undefined as unknown as T;
	}
	if (response.headers.get("Content-Type")?.includes("application/json")) {
		return (await response.json()) as T;
	}
	return (await response.text()) as unknown as T;
}

export async function fetchVerificationStatus(userId?: string, campusId?: string | null): Promise<VerificationStatus> {
	return request<VerificationStatus>("/verify/status", { userId, campusId });
}

export async function startSsoVerification(
	userId: string,
	campusId: string | null,
	provider: string,
	redirectUri?: string,
): Promise<VerificationSsoStart> {
	const query = redirectUri ? `?redirect_uri=${encodeURIComponent(redirectUri)}` : "";
	return request<VerificationSsoStart>(`/verify/sso/${provider}/start${query}`, {
		method: "POST",
		userId,
		campusId,
	});
}

export async function completeSsoVerification(
	provider: string,
	state: string,
	idToken: string,
): Promise<VerificationEntry> {
	return request<VerificationEntry>(`/verify/sso/${provider}/complete`, {
		method: "POST",
		body: { state, id_token: idToken },
	});
}

export async function presignVerificationDocument(
	userId: string,
	campusId: string | null,
	mime: string,
	bytes: number,
): Promise<VerificationDocPresign> {
	return request<VerificationDocPresign>("/verify/doc/presign", {
		method: "POST",
		body: { mime, bytes },
		userId,
		campusId,
	});
}

export async function submitVerificationDocument(
	userId: string,
	campusId: string | null,
	key: string,
	mime?: string,
): Promise<VerificationEntry> {
	return request<VerificationEntry>("/verify/doc/submit", {
		method: "POST",
		body: { key, mime },
		userId,
		campusId,
	});
}

export async function listVerificationQueue(
	adminId?: string,
	campusId?: string | null,
	state: string = "pending",
	limit: number = 50,
): Promise<VerificationEntry[]> {
	const query = `?state=${encodeURIComponent(state)}&limit=${limit}`;
	return request<VerificationEntry[]>(`/admin/verify/queue${query}`, {
		userId: adminId,
		campusId,
	});
}

export async function decideVerification(
	adminId: string,
	campusId: string | null,
	verificationId: string,
	payload: AdminVerificationDecision,
): Promise<VerificationEntry> {
	return request<VerificationEntry>(`/admin/verify/${verificationId}/decide`, {
		method: "POST",
		body: payload,
		userId: adminId,
		campusId,
	});
}

export function formatTrustBadge(summary: TrustProfileSummary): string {
	if (!summary.trust_level) {
		return "Unverified";
	}
	if (summary.badge) {
		return summary.badge.replace("_", " ");
	}
	return `Level ${summary.trust_level}`;
}
