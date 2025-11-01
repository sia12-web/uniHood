import { getBackendUrl } from "./env";
import type { PasskeyDeviceRow, TrustedDeviceRow } from "./types";

type HttpMethod = "GET" | "POST" | "DELETE";

type RequestOptions = {
	method?: HttpMethod;
	body?: unknown;
	userId?: string;
	campusId?: string | null;
	signal?: AbortSignal;
	headers?: Record<string, string>;
};

const BASE_URL = getBackendUrl();

async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
	const { method = "GET", body, userId, campusId, signal, headers: extraHeaders } = options;
	const headers: Record<string, string> = { "Content-Type": "application/json", ...(extraHeaders ?? {}) };
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

export async function fetchPasskeys(userId: string): Promise<PasskeyDeviceRow[]> {
	return request<PasskeyDeviceRow[]>("/passkeys/mine", { userId });
}

export type PasskeyRegistrationOptionsPayload = {
	platform?: "auto" | "cross-platform";
	label?: string;
};

export async function beginPasskeyRegistration(
	userId: string,
	payload: PasskeyRegistrationOptionsPayload = {},
): Promise<Record<string, unknown>> {
	return request<Record<string, unknown>>("/passkeys/register/options", {
		method: "POST",
		userId,
		body: payload,
	});
}

export async function verifyPasskeyRegistration(
	userId: string,
	attestationResponse: Record<string, unknown>,
): Promise<PasskeyDeviceRow> {
	return request<PasskeyDeviceRow>("/passkeys/register/verify", {
		method: "POST",
		userId,
		body: { attestationResponse },
	});
}

export async function updatePasskeyLabel(userId: string, deviceId: string, label: string): Promise<PasskeyDeviceRow> {
	return request<PasskeyDeviceRow>(`/passkeys/mine/${encodeURIComponent(deviceId)}/label`, {
		method: "POST",
		userId,
		body: { label },
	});
}

export async function removePasskey(userId: string, deviceId: string, reauthToken: string): Promise<void> {
	await request<void>(`/passkeys/mine/${encodeURIComponent(deviceId)}`, {
		method: "DELETE",
		userId,
		body: { reauthToken },
	});
}

export type PasskeyAuthOptionsPayload = {
	usernameOrEmail?: string;
};

export async function beginPasskeyAuthentication(
	payload: PasskeyAuthOptionsPayload = {},
): Promise<Record<string, unknown>> {
	return request<Record<string, unknown>>("/passkeys/auth/options", {
		method: "POST",
		body: payload,
	});
}

export async function verifyPasskeyAuthentication(
	assertionResponse: Record<string, unknown>,
	headers: Record<string, string> = {},
): Promise<Record<string, unknown>> {
	return request<Record<string, unknown>>("/passkeys/auth/verify", {
		method: "POST",
		body: { assertionResponse },
		headers,
	});
}

export async function fetchTrustedDevices(userId: string): Promise<TrustedDeviceRow[]> {
	return request<TrustedDeviceRow[]>("/passkeys/devices/mine", { userId });
}

export async function renameTrustedDevice(userId: string, deviceId: string, label: string): Promise<void> {
	await request<void>("/passkeys/devices/label", {
		method: "POST",
		userId,
		body: { deviceId, label },
	});
}

export async function revokeTrustedDevice(userId: string, deviceId: string, reauthToken: string): Promise<void> {
	await request<void>("/passkeys/devices/revoke", {
		method: "POST",
		userId,
		body: { deviceId, reauthToken },
	});
}

export async function revokeAllTrustedDevices(userId: string, reauthToken: string): Promise<void> {
	await request<void>("/passkeys/devices/revoke_all", {
		method: "POST",
		userId,
		body: { reauthToken },
	});
}
