import { getBackendUrl } from "./env";
import type {
	ContactMatchResult,
	ContactOptInResponse,
	ContactSaltResponse,
	ContactUploadResult,
	LinkStartResponse,
	LinkedAccountRow,
	PhoneNumberOut,
} from "./types";

type HttpMethod = "GET" | "POST" | "DELETE";

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
			// ignore secondary failure when decoding error
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
	if (response.headers.get("Content-Type")?.includes("application/json")) {
		return (await response.json()) as T;
	}
	return (await response.text()) as unknown as T;
}

function authHeaders(userId: string, campusId: string | null): Record<string, string> {
	return {
		"X-User-Id": userId,
		...(campusId ? { "X-Campus-Id": campusId } : {}),
	};
}

export async function listLinkProviders(userId: string, campusId: string | null): Promise<string[]> {
	return request<string[]>("/account/link/providers", {
		headers: authHeaders(userId, campusId),
	});
}

export async function listLinkedAccounts(
	userId: string,
	campusId: string | null,
): Promise<LinkedAccountRow[]> {
	return request<LinkedAccountRow[]>("/account/link/list", {
		headers: authHeaders(userId, campusId),
	});
}

export async function startAccountLink(
	userId: string,
	campusId: string | null,
	provider: string,
): Promise<LinkStartResponse> {
	const query = new URLSearchParams({ provider });
	return request<LinkStartResponse>(`/account/link/start?${query.toString()}`, {
		headers: authHeaders(userId, campusId),
	});
}

export async function completeAccountLink(
	userId: string,
	campusId: string | null,
	provider: string,
	subject: string,
	email?: string,
): Promise<{ status: string }> {
	const query = new URLSearchParams({ provider, subject });
	if (email) {
		query.set("email", email);
	}
	return request<{ status: string }>(`/account/link/callback?${query.toString()}`, {
		headers: authHeaders(userId, campusId),
	});
}

export async function unlinkAccountProvider(
	userId: string,
	campusId: string | null,
	provider: string,
): Promise<void> {
	await request(`/account/link/${encodeURIComponent(provider)}`, {
		method: "DELETE",
		headers: authHeaders(userId, campusId),
	});
}

export async function requestEmailChange(
	userId: string,
	campusId: string | null,
	newEmail: string,
): Promise<{ status: string; token: string }>
{
	return request<{ status: string; token: string }>("/account/email/change/request", {
		method: "POST",
		body: { newEmail },
		headers: authHeaders(userId, campusId),
	});
}

export async function confirmEmailChange(
	token: string,
): Promise<{ status: string; verificationToken?: string }> {
	return request<{ status: string; verificationToken?: string }>("/account/email/change/confirm", {
		method: "POST",
		body: { token },
	});
}

export async function requestPhoneVerification(
	userId: string,
	campusId: string | null,
	e164: string,
): Promise<{ status: string }>
{
	return request<{ status: string }>("/account/phone/request", {
		method: "POST",
		body: { e164 },
		headers: authHeaders(userId, campusId),
	});
}

export async function verifyPhoneCode(
	userId: string,
	campusId: string | null,
	code: string,
): Promise<PhoneNumberOut> {
	return request<PhoneNumberOut>("/account/phone/verify", {
		method: "POST",
		body: { code },
		headers: authHeaders(userId, campusId),
	});
}

export async function removePhoneNumber(userId: string, campusId: string | null): Promise<void> {
	await request("/account/phone", {
		method: "DELETE",
		headers: authHeaders(userId, campusId),
	});
}

export async function fetchContactSalt(): Promise<ContactSaltResponse> {
	return request<ContactSaltResponse>("/contact/salt");
}

export async function updateContactOptIn(
	userId: string,
	campusId: string | null,
	enabled: boolean,
): Promise<ContactOptInResponse> {
	return request<ContactOptInResponse>("/contact/optin", {
		method: "POST",
		body: { enabled },
		headers: authHeaders(userId, campusId),
	});
}

export async function uploadContactHashes(
	userId: string,
	campusId: string | null,
	hashes: string[],
): Promise<ContactUploadResult> {
	return request<ContactUploadResult>("/contact/upload", {
		method: "POST",
		body: { hashes },
		headers: authHeaders(userId, campusId),
	});
}

export async function matchContactHashes(
	userId: string,
	campusId: string | null,
	hashes: string[],
): Promise<ContactMatchResult> {
	return request<ContactMatchResult>("/contact/match", {
		method: "POST",
		body: { hashes },
		headers: authHeaders(userId, campusId),
	});
}
