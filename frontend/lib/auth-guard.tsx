import { cache } from "react";
import { redirect } from "next/navigation";

export type CurrentUser = {
	id: string;
	email?: string;
	display_name?: string | null;
	handle?: string | null;
	avatar_url?: string | null;
	roles?: string[];
};

type FetchMeResponse = CurrentUser | null;

function shouldUseStub(): boolean {
	if (typeof process === 'undefined') return false;
	return process.env?.NEXT_PUBLIC_COMMUNITIES_STUB === "1" || Boolean(process.env?.PLAYWRIGHT_BASE_URL);
}

function buildStubUser(): CurrentUser {
	return {
		id: "staff-stub",
		email: "staff@example.com",
		display_name: "Staff Test",
		handle: "staff-test",
		roles: ["moderator"],
	};
}

let resolvedBaseUrl: string | null = null;

function getBaseUrl(): string {
	if (resolvedBaseUrl) {
		return resolvedBaseUrl;
	}
	const envUrl = typeof process !== 'undefined'
		? (process.env?.NEXT_PUBLIC_SITE_URL ??
			process.env?.NEXTAUTH_URL ??
			process.env?.VERCEL_URL ??
			process.env?.PLAYWRIGHT_BASE_URL ??
			null)
		: null;
	if (envUrl) {
		const hasProtocol = envUrl.startsWith("http://") || envUrl.startsWith("https://");
		resolvedBaseUrl = hasProtocol ? envUrl : `https://${envUrl}`;
		return resolvedBaseUrl;
	}
	const port = typeof process !== 'undefined'
		? (process.env?.PORT ?? process.env?.NEXT_PUBLIC_PORT ?? "3000")
		: "3000";
	resolvedBaseUrl = `http://localhost:${port}`;
	return resolvedBaseUrl;
}

export const fetchCurrentUser = cache(async (): Promise<FetchMeResponse> => {
	try {
		const url = new URL("/api/me", getBaseUrl()).toString();
		const res = await fetch(url, {
			headers: { Accept: "application/json" },
			cache: "no-store",
			credentials: "include",
		});
		if (res.status === 401) {
			if (shouldUseStub()) {
				return buildStubUser();
			}
			return null;
		}
		if (!res.ok) {
			if (shouldUseStub()) {
				return buildStubUser();
			}
			throw new Error(`fetch /api/me failed: ${res.status}`);
		}
		return (await res.json()) as CurrentUser;
	} catch (error) {
		if (typeof process !== 'undefined' && process.env?.NODE_ENV !== "production") {
			console.warn("fetchCurrentUser error", error);
		}
		if (shouldUseStub()) {
			return buildStubUser();
		}
		return null;
	}
});

export async function requireCurrentUser(): Promise<CurrentUser> {
	const me = await fetchCurrentUser();
	if (!me) {
		redirect("/login?next=/communities");
	}
	return me;
}
