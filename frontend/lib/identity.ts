import { getBackendUrl, getExplicitBackendUrl, isDevApiProxyEnabled } from "./env";
import { readAuthSnapshot } from "./auth-storage";
import type { CampusRow, ProfilePrivacy, ProfileRecord, ProfileStatus } from "./types";

type HttpMethod = "GET" | "POST" | "PATCH";

// Resolve backend base URL with a strong preference for the public client env var when
// available. This avoids accidental relative requests to the frontend origin.
const BASE_URL = getBackendUrl();

if (process.env.NODE_ENV !== "production") {
	// Helpful runtime diagnostic during development only
	// eslint-disable-next-line no-console
	console.info("[identity] BASE_URL set to:", BASE_URL);
}

type RequestOptions = {
	method?: HttpMethod;
	body?: unknown;
	headers?: Record<string, string>;
};

export class HttpError extends Error {
	status: number;
	details?: unknown;

	constructor(status: number, message: string, details?: unknown) {
		super(message);
		this.name = "HttpError";
		this.status = status;
		this.details = details;
	}
}

async function decodeError(path: string, response: Response): Promise<never> {
	let message = `Request failed (${response.status})`;
	let details: unknown = null;
	const contentType = response.headers.get("Content-Type") ?? "";
	try {
		if (contentType.includes("application/json")) {
			details = await response.json();
			if (typeof details === "string") {
				message = details;
			} else if (details && typeof (details as Record<string, unknown>).detail !== "undefined") {
				const detailValue = (details as Record<string, unknown>).detail;
				if (typeof detailValue === "string") {
					message = detailValue;
				} else if (detailValue !== null && detailValue !== undefined) {
					message = JSON.stringify(detailValue);
				}
			}
		} else if (contentType.includes("text/html")) {
			// Many development misconfigurations cause the frontend to respond to API
			// requests with an HTML page (Next.js 404). Detect that and return a
			// concise, actionable error message instead of embedding the full HTML.
			const text = await response.text();
			details = (text || "").slice(0, 400); // cap details to avoid huge logs
			message = `Unexpected HTML response from API (status=${response.status}). Check that NEXT_PUBLIC_BACKEND_URL is set and the backend is running.`;
		} else {
			const text = await response.text();
			if (text) {
				details = text;
				message = text;
			}
		}
	} catch (err) {
		if (process.env.NODE_ENV !== "production") {
			console.warn("[identity] Failed to decode error response", {
				path,
				status: response.status,
				error: err instanceof Error ? err.message : String(err),
			});
		}
	}

	if (process.env.NODE_ENV !== "production") {
		console.error("[identity] Request failed", {
			path,
			status: response.status,
			message,
			details,
		});
	}

	throw new HttpError(response.status, message, details ?? undefined);
}

async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
	const { method = "GET", body, headers = {} } = options;
	const devProxy = typeof window !== "undefined" && isDevApiProxyEnabled();
	const url = devProxy ? path : `${BASE_URL}${path}`;
	if (process.env.NODE_ENV !== "production") {
		// eslint-disable-next-line no-console
		console.info("[identity] request", { url, method, devProxy });
	}
	const response = await fetch(url, {
		method,
		headers: {
			...(body !== undefined ? { "Content-Type": "application/json" } : {}),
			...headers,
		},
		body: body !== undefined ? JSON.stringify(body) : undefined,
		credentials: "include",
		cache: "no-store",
	});
	if (!response.ok) {
		await decodeError(path, response);
	}

	// If the API responded with HTML (e.g. a Next.js 404 page) treat this as an error.
	const respContentType = response.headers.get("Content-Type") ?? "";
	if (respContentType.includes("text/html")) {
		// Read body for diagnostics.
		const html = await response.text();
		if (process.env.NODE_ENV !== "production") {
			console.error("[identity] API returned HTML; likely hit frontend instead of backend", {
				path,
				baseUrl: BASE_URL,
				status: response.status,
				preview: html.slice(0, 300),
			});
			// Attempt a one-time retry using the explicit env backend URL if different.
			const explicit = getExplicitBackendUrl();
			if (explicit && explicit !== BASE_URL) {
				const retryUrl = `${explicit}${path}`;
				console.warn("[identity] retrying against explicit backend URL", { retryUrl });
				const retryResp = await fetch(retryUrl, {
					method,
					headers: {
						...(body !== undefined ? { "Content-Type": "application/json" } : {}),
						...headers,
					},
					body: body !== undefined ? JSON.stringify(body) : undefined,
					credentials: "include",
					cache: "no-store",
				});
				if (retryResp.ok) {
					const retryType = retryResp.headers.get("Content-Type") ?? "";
					if (retryType.includes("application/json")) {
						return (await retryResp.json()) as T;
					}
					return (await retryResp.text()) as unknown as T;
				}
				await decodeError(path, retryResp);
			}
		}
		throw new HttpError(
			response.status,
			`Unexpected HTML response from API (status=${response.status}). Check that NEXT_PUBLIC_BACKEND_URL is configured and the backend is reachable.`,
			html.slice(0, 400),
		);
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

export type RegisterPayload = {
	email: string;
	password: string;
	handle: string;
	display_name?: string;
	campus_id: string;
};

export type RegisterResponse = {
	user_id: string;
	email: string;
};

export type LoginPayload = {
	email: string;
	password: string;
};

export type LoginResponse = {
	access_token: string;
	refresh_token: string;
	token_type: "bearer";
	expires_in: number;
	user_id: string;
};

export type VerificationResponse = {
	verified: boolean;
	user_id: string;
};

export type ProfilePatchPayload = {
	display_name?: string;
	bio?: string;
	privacy?: Partial<ProfilePrivacy>;
	status?: Partial<Omit<ProfileStatus, "updated_at">> & { updated_at?: string };
	handle?: string;
	major?: string | null;
	graduation_year?: number | null;
	passions?: string[];
};

export type PresignPayload = {
	mime: string;
	bytes: number;
};

export type PresignResponse = {
	key: string;
	url: string;
	expires_s: number;
};

export async function listCampuses(): Promise<CampusRow[]> {
	return request<CampusRow[]>("/auth/campuses");
}

export async function registerIdentity(payload: RegisterPayload): Promise<RegisterResponse> {
	return request<RegisterResponse>("/auth/register", { method: "POST", body: payload });
}

export async function loginIdentity(payload: LoginPayload): Promise<LoginResponse> {
	return request<LoginResponse>("/auth/login", { method: "POST", body: payload });
}

export async function verifyEmailToken(token: string): Promise<VerificationResponse> {
	return request<VerificationResponse>("/auth/verify-email", {
		method: "POST",
		body: { token },
	});
}

export async function resendVerification(email: string): Promise<void> {
	await request<void>("/auth/resend", {
		method: "POST",
		body: { email },
	});
}

function authHeaders(userId: string, campusId: string | null): Record<string, string> {
	const snapshot = readAuthSnapshot();
	const accessToken = snapshot?.access_token;
	return {
		"X-User-Id": userId,
		...(campusId ? { "X-Campus-Id": campusId } : {}),
		...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
	};
}

export async function fetchProfile(userId: string, campusId: string | null): Promise<ProfileRecord> {
	return request<ProfileRecord>("/profile/me", { headers: authHeaders(userId, campusId) });
}

export async function patchProfile(
	userId: string,
	campusId: string | null,
	patch: ProfilePatchPayload,
): Promise<ProfileRecord> {
	return request<ProfileRecord>("/profile/me", {
		method: "PATCH",
		body: patch,
		headers: authHeaders(userId, campusId),
	});
}

export async function presignAvatar(
	userId: string,
	campusId: string | null,
	payload: PresignPayload,
): Promise<PresignResponse> {
	return request<PresignResponse>("/profile/avatar/presign", {
		method: "POST",
		body: payload,
		headers: authHeaders(userId, campusId),
	});
}

export async function commitAvatar(
	userId: string,
	campusId: string | null,
	key: string,
): Promise<ProfileRecord> {
	return request<ProfileRecord>("/profile/avatar/commit", {
		method: "POST",
		body: { key },
		headers: authHeaders(userId, campusId),
	});
}

export async function presignGallery(
	userId: string,
	campusId: string | null,
	payload: PresignPayload,
): Promise<PresignResponse> {
	return request<PresignResponse>("/profile/gallery/presign", {
		method: "POST",
		body: payload,
		headers: authHeaders(userId, campusId),
	});
}

export async function commitGalleryImage(
	userId: string,
	campusId: string | null,
	key: string,
): Promise<ProfileRecord> {
	return request<ProfileRecord>("/profile/gallery/commit", {
		method: "POST",
		body: { key },
		headers: authHeaders(userId, campusId),
	});
}

export async function removeGalleryImage(
	userId: string,
	campusId: string | null,
	key: string,
): Promise<ProfileRecord> {
	return request<ProfileRecord>("/profile/gallery/remove", {
		method: "POST",
		body: { key },
		headers: authHeaders(userId, campusId),
	});
}
