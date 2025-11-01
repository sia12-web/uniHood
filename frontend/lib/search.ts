import { getBackendUrl, getDemoCampusId, getDemoUserId } from "./env";
import type { PagedResponse, RoomDiscoverResult, SearchUserResult } from "./types";

type RequestOptions = {
	userId?: string;
	campusId?: string | null;
	signal?: AbortSignal;
};

const BASE_URL = getBackendUrl();

async function requestList<T>(path: string, options: RequestOptions = {}): Promise<PagedResponse<T>> {
	const { userId, campusId, signal } = options;
	const headers: Record<string, string> = { "Content-Type": "application/json" };
	if (userId) {
		headers["X-User-Id"] = userId;
	}
	if (campusId) {
		headers["X-Campus-Id"] = campusId;
	}
	const response = await fetch(`${BASE_URL}${path}`, {
		method: "GET",
		headers,
		signal,
	});
	if (!response.ok) {
		const detail = await response.text();
		throw new Error(detail || `Request failed (${response.status})`);
	}
	if (response.status === 204) {
		return { items: [], cursor: null } as PagedResponse<T>;
	}
	return (await response.json()) as PagedResponse<T>;
}

type SearchUsersParams = {
	query: string;
	limit?: number;
	cursor?: string | null;
	userId?: string;
	campusId?: string | null;
	signal?: AbortSignal;
};

export async function searchUsers(params: SearchUsersParams): Promise<PagedResponse<SearchUserResult>> {
	const limit = params.limit ?? 20;
	const cursor = params.cursor ?? undefined;
	const userId = params.userId ?? getDemoUserId();
	const campusId = params.campusId ?? getDemoCampusId();
	const normalized = params.query.trim();
	const searchParams = new URLSearchParams();
	searchParams.set("q", normalized);
	searchParams.set("limit", String(limit));
	if (cursor) {
		searchParams.set("cursor", cursor);
	}
	if (params.campusId) {
		searchParams.set("campus_id", params.campusId);
	}
	return requestList<SearchUserResult>(`/search/users?${searchParams.toString()}`, {
		userId,
		campusId,
		signal: params.signal,
	});
}

type DiscoverParams = {
	limit?: number;
	cursor?: string | null;
	campusId?: string | null;
	userId?: string;
	signal?: AbortSignal;
};

export async function discoverPeople(params: DiscoverParams = {}): Promise<PagedResponse<SearchUserResult>> {
	const limit = params.limit ?? 20;
	const cursor = params.cursor ?? undefined;
	const campusId = params.campusId ?? getDemoCampusId();
	const userId = params.userId ?? getDemoUserId();
	const searchParams = new URLSearchParams();
	searchParams.set("limit", String(limit));
	if (cursor) {
		searchParams.set("cursor", cursor);
	}
	if (params.campusId) {
		searchParams.set("campus_id", params.campusId);
	}
	return requestList<SearchUserResult>(`/discover/people?${searchParams.toString()}`, {
		userId,
		campusId,
		signal: params.signal,
	});
}

export async function discoverRooms(params: DiscoverParams = {}): Promise<PagedResponse<RoomDiscoverResult>> {
	const limit = params.limit ?? 20;
	const cursor = params.cursor ?? undefined;
	const campusId = params.campusId ?? getDemoCampusId();
	const userId = params.userId ?? getDemoUserId();
	const searchParams = new URLSearchParams();
	searchParams.set("limit", String(limit));
	if (cursor) {
		searchParams.set("cursor", cursor);
	}
	if (params.campusId) {
		searchParams.set("campus_id", params.campusId);
	}
	return requestList<RoomDiscoverResult>(`/discover/rooms?${searchParams.toString()}`, {
		userId,
		campusId,
		signal: params.signal,
	});
}
