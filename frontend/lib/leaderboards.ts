import { getBackendUrl, getDemoCampusId, getDemoUserId } from "./env";
import type {
	LeaderboardPeriod,
	LeaderboardResponse,
	LeaderboardScope,
	MyLeaderboardSummary,
	StreakSummary,
} from "./types";

type HttpMethod = "GET" | "POST";

type RequestOptions = {
	method?: HttpMethod;
	userId?: string;
	campusId?: string | null;
	body?: unknown;
	signal?: AbortSignal;
};

const BASE_URL = getBackendUrl();

async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
	const { method = "GET", body, userId, campusId, signal } = options;
	const headers: Record<string, string> = { "Content-Type": "application/json" };
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

type LeaderboardQuery = {
	period?: LeaderboardPeriod;
	campusId?: string;
	ymd?: number;
	limit?: number;
	signal?: AbortSignal;
};

export async function fetchLeaderboard(scope: LeaderboardScope, query: LeaderboardQuery = {}): Promise<LeaderboardResponse> {
	const params = new URLSearchParams();
	const campusId = query.campusId ?? getDemoCampusId();
	params.set("campus_id", campusId);
	if (query.period) {
		params.set("period", query.period);
	}
	if (query.ymd) {
		params.set("ymd", String(query.ymd));
	}
	if (query.limit) {
		params.set("limit", String(query.limit));
	}
	return request<LeaderboardResponse>(`/leaderboards/${scope}?${params.toString()}`, {
		signal: query.signal,
	});
}

type MySummaryQuery = {
	ymd?: number;
	userId?: string;
	campusId?: string;
	signal?: AbortSignal;
};

export async function fetchMySummary(query: MySummaryQuery = {}): Promise<MyLeaderboardSummary> {
	const userId = query.userId ?? getDemoUserId();
	const campusId = query.campusId ?? getDemoCampusId();
	const params = new URLSearchParams();
	if (query.ymd) {
		params.set("ymd", String(query.ymd));
	}
	const suffix = params.toString();
	const path = suffix ? `/leaderboards/me/summary?${suffix}` : "/leaderboards/me/summary";
	return request<MyLeaderboardSummary>(path, {
		userId,
		campusId,
		signal: query.signal,
	});
}

export async function fetchStreakSummary(userId: string, query: { signal?: AbortSignal } = {}): Promise<StreakSummary> {
	return request<StreakSummary>(`/leaderboards/streaks/${userId}`, {
		signal: query.signal,
	});
}
