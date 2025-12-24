import { cache } from "react";
import { redirect } from "next/navigation";
import { cookies } from "next/headers";

export type StaffScope = "moderator" | "admin";

export type StaffProfile = {
	id: string;
	display_name?: string | null;
	email?: string | null;
	avatar_url?: string | null;
	scopes: string[];
	campuses: string[];
	default_campus?: string | null;
};

export type StaffGuardResult = {
	profile: StaffProfile;
	activeCampus: string | null;
	availableCampuses: string[];
};

const LOGIN_REDIRECT = "/login?next=/admin/mod/cases";

function shouldUseStub(): boolean {
	return process.env.NEXT_PUBLIC_COMMUNITIES_STUB === "1" || Boolean(process.env.PLAYWRIGHT_BASE_URL);
}

function buildStubProfile(): StaffProfile {
	return {
		id: "staff-stub",
		display_name: "Staff Stub",
		email: "staff@example.com",
		avatar_url: null,
		scopes: ["staff.moderator"],
		campuses: ["global"],
		default_campus: "global",
	};
}

function getLocalBase(): string {
	const port = process.env.PORT ?? process.env.NEXT_PUBLIC_PORT ?? "3000";
	return `http://localhost:${port}`;
}

let resolvedMeEndpoint: string | null = null;

function resolveMeEndpoint(): string {
	if (resolvedMeEndpoint) {
		return resolvedMeEndpoint;
	}
	const direct = process.env.NEXT_PUBLIC_MOD_API_ME;
	if (direct) {
		const hasProtocol = direct.startsWith("http://") || direct.startsWith("https://");
		resolvedMeEndpoint = hasProtocol ? direct : new URL(direct, getLocalBase()).toString();
		return resolvedMeEndpoint;
	}
	const base =
		process.env.NEXT_PUBLIC_MOD_API_BASE ??
		process.env.NEXT_PUBLIC_BACKEND_URL ??
		process.env.NEXT_PUBLIC_API_BASE_URL ??
		process.env.PLAYWRIGHT_BASE_URL ??
		null;
	if (base) {
		const clean = base.startsWith("http://") || base.startsWith("https://") ? base : `https://${base}`;
		resolvedMeEndpoint = new URL("/api/mod/v1/me", clean).toString();
		return resolvedMeEndpoint;
	}
	resolvedMeEndpoint = new URL("/api/mod/v1/me", getLocalBase()).toString();
	return resolvedMeEndpoint;
}

export const fetchStaffProfile = cache(async (): Promise<StaffProfile | null> => {
	try {
		const endpoint = resolveMeEndpoint();

		// In SSR, we need to manually pass the auth cookie to the backend
		const cookieStore = cookies();
		const authCookie = cookieStore.get("divan.auth")?.value ?? cookieStore.get("access_token")?.value;

		const res = await fetch(endpoint, {
			headers: {
				Accept: "application/json",
				...(authCookie ? { Authorization: `Bearer ${authCookie}` } : {})
			},
			cache: "no-store",
		});

		if (res.status === 401) {
			if (shouldUseStub()) {
				return buildStubProfile();
			}
			return null;
		}
		if (!res.ok) {
			if (shouldUseStub()) {
				return buildStubProfile();
			}
			throw new Error(`Failed to fetch staff profile: ${res.status}`);
		}
		return (await res.json()) as StaffProfile;
	} catch (error) {
		if (process.env.NODE_ENV !== "production") {
			console.warn("fetchStaffProfile error", error);
		}
		if (shouldUseStub()) {
			return buildStubProfile();
		}
		return null;
	}
});

function hasRequiredScope(profile: StaffProfile, scope: StaffScope): boolean {
	const scopes = new Set(profile.scopes ?? []);
	if (scopes.has("staff.admin")) {
		return true;
	}
	// Fallback for global admin role
	if (scopes.has("admin")) {
		return true;
	}
	return scopes.has(`staff.${scope}`);
}

export async function requireStaff(scope: StaffScope = "moderator"): Promise<StaffGuardResult> {
	const profile = await fetchStaffProfile();
	if (!profile) {
		redirect(LOGIN_REDIRECT);
	}
	if (!hasRequiredScope(profile, scope)) {
		redirect("/");
	}
	const availableCampuses = profile.campuses?.length ? profile.campuses : [];
	const activeCampus = profile.default_campus ?? availableCampuses[0] ?? null;
	return {
		profile,
		activeCampus,
		availableCampuses,
	};
}
