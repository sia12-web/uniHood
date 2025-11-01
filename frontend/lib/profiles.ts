import { getBackendUrl } from "./env";
import type {
	EducationRecord,
	InterestNode,
	MatchPerson,
	MyInterest,
	MyLink,
	MySkill,
	PublicProfile,
	VisibilityScope,
} from "./types";

type HttpMethod = "GET" | "POST" | "PATCH" | "DELETE";

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
	const headers: Record<string, string> = {};
	if (body !== undefined) {
		headers["Content-Type"] = "application/json";
	}
	if (userId) {
		headers["X-User-Id"] = userId;
	}
	if (campusId) {
		headers["X-Campus-Id"] = campusId;
	}
	const response = await fetch(`${BASE_URL}${path}`, {
		method,
		headers,
		body: body !== undefined ? JSON.stringify(body) : undefined,
		cache: "no-store",
		signal,
	});
	if (!response.ok) {
		let detail: string | null = null;
		try {
			detail = await response.text();
		} catch {
			detail = null;
		}
		throw new Error(detail || `Request failed (${response.status})`);
	}
	if (response.status === 204) {
		return undefined as unknown as T;
	}
	if (response.headers.get("Content-Length") === "0") {
		return undefined as unknown as T;
	}
	const contentType = response.headers.get("Content-Type") ?? "";
	if (contentType.includes("application/json")) {
		return (await response.json()) as T;
	}
	return (await response.text()) as unknown as T;
}

export async function fetchInterestTaxonomy(params: {
	limit?: number;
	offset?: number;
	parentId?: string | null;
} = {}): Promise<InterestNode[]> {
	const search = new URLSearchParams();
	if (params.limit) {
		search.set("limit", String(params.limit));
	}
	if (params.offset) {
		search.set("offset", String(params.offset));
	}
	if (params.parentId) {
		search.set("parent_id", params.parentId);
	}
	const query = search.toString();
	return request<InterestNode[]>(`/interests/taxonomy${query ? `?${query}` : ""}`);
}

export async function suggestInterests(
	query: string,
	options: { campusId?: string | null; limit?: number; signal?: AbortSignal } = {},
): Promise<InterestNode[]> {
	const normalized = query.trim();
	if (normalized.length < 2) {
		return [];
	}
	const search = new URLSearchParams();
	search.set("q", normalized);
	search.set("limit", String(options.limit ?? 10));
	if (options.campusId) {
		search.set("campus_id", options.campusId);
	}
	return request<InterestNode[]>(`/interests/suggest?${search.toString()}`, {
		signal: options.signal,
	});
}

export async function fetchMyInterests(userId: string, campusId: string | null): Promise<MyInterest[]> {
	return request<MyInterest[]>("/interests/me", { userId, campusId });
}

export async function addInterest(
	userId: string,
	campusId: string | null,
	interestId: string,
	visibility: VisibilityScope = "everyone",
): Promise<MyInterest[]> {
	return request<MyInterest[]>("/interests/me", {
		method: "POST",
		body: { interest_id: interestId, visibility },
		userId,
		campusId,
	});
}

export async function removeInterest(
	userId: string,
	campusId: string | null,
	interestId: string,
): Promise<MyInterest[]> {
	return request<MyInterest[]>("/interests/me", {
		method: "DELETE",
		body: { interest_id: interestId },
		userId,
		campusId,
	});
}

export async function updateInterestVisibility(
	userId: string,
	campusId: string | null,
	interestId: string,
	visibility: VisibilityScope,
): Promise<MyInterest[]> {
	return request<MyInterest[]>("/interests/me/visibility", {
		method: "PATCH",
		body: { interest_id: interestId, visibility },
		userId,
		campusId,
	});
}

export async function fetchMySkills(userId: string, campusId: string | null): Promise<MySkill[]> {
	return request<MySkill[]>("/skills/me", { userId, campusId });
}

export async function upsertSkill(
	userId: string,
	campusId: string | null,
	params: { name: string; display: string; proficiency: number; visibility?: VisibilityScope },
): Promise<MySkill[]> {
	return request<MySkill[]>("/skills/me", {
		method: "POST",
		body: params,
		userId,
		campusId,
	});
}

export async function removeSkill(
	userId: string,
	campusId: string | null,
	name: string,
): Promise<MySkill[]> {
	return request<MySkill[]>("/skills/me", {
		method: "DELETE",
		body: { name },
		userId,
		campusId,
	});
}

export async function updateSkillVisibility(
	userId: string,
	campusId: string | null,
	name: string,
	visibility: VisibilityScope,
): Promise<MySkill[]> {
	return request<MySkill[]>("/skills/me/visibility", {
		method: "PATCH",
		body: { name, visibility },
		userId,
		campusId,
	});
}

export async function fetchMyLinks(userId: string, campusId: string | null): Promise<MyLink[]> {
	return request<MyLink[]>("/links/me", { userId, campusId });
}

export async function upsertLink(
	userId: string,
	campusId: string | null,
	params: { kind: string; url: string; visibility?: VisibilityScope },
): Promise<MyLink[]> {
	return request<MyLink[]>("/links/me", {
		method: "POST",
		body: params,
		userId,
		campusId,
	});
}

export async function removeLink(userId: string, campusId: string | null, kind: string): Promise<MyLink[]> {
	return request<MyLink[]>("/links/me", {
		method: "DELETE",
		body: { kind },
		userId,
		campusId,
	});
}

export async function updateLinkVisibility(
	userId: string,
	campusId: string | null,
	kind: string,
	visibility: VisibilityScope,
): Promise<MyLink[]> {
	return request<MyLink[]>("/links/me/visibility", {
		method: "PATCH",
		body: { kind, visibility },
		userId,
		campusId,
	});
}

export async function fetchEducation(userId: string, campusId: string | null): Promise<EducationRecord> {
	return request<EducationRecord>("/education/me", { userId, campusId });
}

export async function patchEducation(
	userId: string,
	campusId: string | null,
	payload: Partial<{ program: string; year: number | null; visibility: VisibilityScope }>,
): Promise<EducationRecord> {
	return request<EducationRecord>("/education/me", {
		method: "PATCH",
		body: payload,
		userId,
		campusId,
	});
}

export async function fetchPublicProfile(
	handle: string,
	options: { userId?: string; campusId?: string | null; signal?: AbortSignal } = {},
): Promise<PublicProfile> {
	const safeHandle = handle.trim().replace(/^@/, "");
	return request<PublicProfile>(`/profiles/public/${encodeURIComponent(safeHandle)}`, {
		userId: options.userId,
		campusId: options.campusId,
		signal: options.signal,
	});
}

export async function matchPeople(
	options: {
		userId: string;
		campusId?: string | null;
		interests?: string[];
		skills?: string[];
		limit?: number;
		signal?: AbortSignal;
	},
): Promise<MatchPerson[]> {
	const search = new URLSearchParams();
	const interestTerms = options.interests ?? [];
	const skillTerms = options.skills ?? [];
	for (const interest of interestTerms) {
		if (interest.trim()) {
			search.append("interests", interest.trim());
		}
	}
	for (const skill of skillTerms) {
		if (skill.trim()) {
			search.append("skills", skill.trim());
		}
	}
	if (!search.has("interests") && !search.has("skills")) {
		throw new Error("Provide at least one interest or skill filter");
	}
	search.set("limit", String(options.limit ?? 20));
	if (options.campusId) {
		search.set("campus_id", options.campusId);
	}
	return request<MatchPerson[]>(`/profiles/match?${search.toString()}`, {
		userId: options.userId,
		campusId: options.campusId ?? null,
		signal: options.signal,
	});
}
