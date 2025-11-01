import { getBackendUrl } from "./env";
import type { CampusRow, ProfilePrivacy, ProfileRecord, ProfileStatus } from "./types";

type HttpMethod = "GET" | "POST" | "PATCH";

const BASE_URL = getBackendUrl();

type RequestOptions = {
	method?: HttpMethod;
	body?: unknown;
	headers?: Record<string, string>;
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
			// swallow secondary failure
		}
	}
	throw new Error(message);
}

async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
	const { method = "GET", body, headers = {} } = options;
	const response = await fetch(`${BASE_URL}${path}`, {
		method,
		headers: {
			...(body !== undefined ? { "Content-Type": "application/json" } : {}),
			...headers,
		},
		body: body !== undefined ? JSON.stringify(body) : undefined,
		cache: "no-store",
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
	return {
		"X-User-Id": userId,
		...(campusId ? { "X-Campus-Id": campusId } : {}),
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
