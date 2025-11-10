import { apiFetch, type ApiFetchOptions } from "@/app/lib/http/client";
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

type RequestOptions = ApiFetchOptions;

const BASE_URL = getBackendUrl();

async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
	const url = path.startsWith("http")
		? path
		: `${BASE_URL}${path.startsWith("/") ? "" : "/"}${path}`;
	return apiFetch<T>(url, {
		cache: "no-store",
		method: options.method ?? "GET",
		...options,
		headers: {
			...(options.headers ?? {}),
		},
	});
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
