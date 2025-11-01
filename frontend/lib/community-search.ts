import { getBackendUrl, getDemoCampusId, getDemoUserId } from "./env";

export type SearchResultHit<T> = {
  _id: string;
  score: number;
  source: T;
  highlight?: Record<string, string[]>;
};

export type SearchFacetBucket = {
  value: string;
  count: number;
  label?: string | null;
};

export type SearchFacet = {
  field: string;
  buckets: SearchFacetBucket[];
};

export type SearchResponse<T> = {
  hits: SearchResultHit<T>[];
  next?: string | null;
  took_ms: number;
  facets?: Record<string, SearchFacet>;
};

export type SearchParamsBase = {
  q?: string;
  campus_id?: string | null;
  time_from?: string | null;
  time_to?: string | null;
  size?: number;
  next?: string | null;
  signal?: AbortSignal;
};

export type GroupSearchSource = {
  id: string;
  name: string;
  description?: string | null;
  campus_name?: string | null;
  member_count?: number | null;
  tags?: string[] | null;
  visibility?: "public" | "campus" | "private";
  hero_image_url?: string | null;
};

export type PostSearchSource = {
  id: string;
  title?: string | null;
  body_trunc?: string | null;
  campus_name?: string | null;
  group_name?: string | null;
  tags?: string[] | null;
  comment_count?: number | null;
  reaction_count?: number | null;
  author_name?: string | null;
  published_at?: string | null;
};

export type EventSearchSource = {
  id: string;
  title: string;
  description?: string | null;
  start_at: string;
  end_at: string;
  campus_name?: string | null;
  group_name?: string | null;
  venue_label?: string | null;
  tags?: string[] | null;
  going_count?: number | null;
};

export type GroupsSearchParams = SearchParamsBase;

export type PostsSearchParams = SearchParamsBase & {
  tags?: string[] | null;
};

export type EventsSearchParams = SearchParamsBase;

export type TypeaheadScope = "all" | "groups" | "posts" | "events";

export type TypeaheadResult = {
  scope: TypeaheadScope;
  id: string;
  label: string;
  description?: string | null;
};

type RateLimitError = Error & {
  status: number;
  retryAfter?: number;
};

const BASE_URL = getBackendUrl();

function resolveUserId(userId?: string) {
  return userId ?? getDemoUserId();
}

function resolveCampusId(campusId?: string | null) {
  return campusId ?? getDemoCampusId();
}

async function request<T>(path: string, init: RequestInit): Promise<SearchResponse<T>> {
  const response = await fetch(`${BASE_URL}${path}`, init);
  if (!response.ok) {
    if (response.status === 429) {
      const retryAfterHeader = response.headers.get("Retry-After");
      const error: RateLimitError = Object.assign(new Error("Rate limited"), {
        status: 429,
        retryAfter: retryAfterHeader ? Number.parseInt(retryAfterHeader, 10) : undefined,
      });
      throw error;
    }
    const detail = await response.text();
    throw new Error(detail || `Request failed (${response.status})`);
  }
  return (await response.json()) as SearchResponse<T>;
}

function buildHeaders(userId?: string, campusId?: string | null): HeadersInit {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  const resolvedUser = resolveUserId(userId);
  const resolvedCampus = resolveCampusId(campusId);
  if (resolvedUser) {
    headers["X-User-Id"] = resolvedUser;
  }
  if (resolvedCampus) {
    headers["X-Campus-Id"] = resolvedCampus;
  }
  return headers;
}

export async function searchGroups(
  params: GroupsSearchParams & { userId?: string },
): Promise<SearchResponse<GroupSearchSource>> {
  const { signal, next, size = 20, userId, campus_id, q, time_from, time_to } = params;
  const searchParams = new URLSearchParams();
  if (q) {
    searchParams.set("q", q);
  }
  if (campus_id) {
    searchParams.set("campus_id", campus_id);
  }
  if (time_from) {
    searchParams.set("time_from", time_from);
  }
  if (time_to) {
    searchParams.set("time_to", time_to);
  }
  searchParams.set("size", String(size));
  if (next) {
    searchParams.set("next", next);
  }

  return request<GroupSearchSource>(`/search/groups?${searchParams.toString()}`, {
    method: "GET",
    headers: buildHeaders(userId, campus_id ?? null),
    signal,
  });
}

export async function searchPosts(
  params: PostsSearchParams & { userId?: string },
): Promise<SearchResponse<PostSearchSource>> {
  const { signal, next, size = 20, userId, campus_id, q, time_from, time_to, tags } = params;
  const searchParams = new URLSearchParams();
  if (q) {
    searchParams.set("q", q);
  }
  if (campus_id) {
    searchParams.set("campus_id", campus_id);
  }
  if (time_from) {
    searchParams.set("time_from", time_from);
  }
  if (time_to) {
    searchParams.set("time_to", time_to);
  }
  searchParams.set("size", String(size));
  if (next) {
    searchParams.set("next", next);
  }
  tags?.forEach((tag) => {
    if (tag) {
      searchParams.append("tags[]", tag);
    }
  });

  return request<PostSearchSource>(`/search/posts?${searchParams.toString()}`, {
    method: "GET",
    headers: buildHeaders(userId, campus_id ?? null),
    signal,
  });
}

export async function searchEvents(
  params: EventsSearchParams & { userId?: string },
): Promise<SearchResponse<EventSearchSource>> {
  const { signal, next, size = 20, userId, campus_id, q, time_from, time_to } = params;
  const searchParams = new URLSearchParams();
  if (q) {
    searchParams.set("q", q);
  }
  if (campus_id) {
    searchParams.set("campus_id", campus_id);
  }
  if (time_from) {
    searchParams.set("time_from", time_from);
  }
  if (time_to) {
    searchParams.set("time_to", time_to);
  }
  searchParams.set("size", String(size));
  if (next) {
    searchParams.set("next", next);
  }

  return request<EventSearchSource>(`/search/events?${searchParams.toString()}`, {
    method: "GET",
    headers: buildHeaders(userId, campus_id ?? null),
    signal,
  });
}

export async function searchTypeahead(params: {
  q: string;
  scope?: TypeaheadScope;
  userId?: string;
  campus_id?: string | null;
  signal?: AbortSignal;
}): Promise<{ hits: TypeaheadResult[] }> {
  const { q, scope, userId, campus_id, signal } = params;
  const searchParams = new URLSearchParams();
  searchParams.set("q", q);
  if (scope && scope !== "all") {
    searchParams.set("scope", scope);
  }
  const response = await fetch(`${BASE_URL}/search/typeahead?${searchParams.toString()}`, {
    method: "GET",
    headers: buildHeaders(userId, campus_id ?? null),
    signal,
  });
  if (!response.ok) {
    if (response.status === 429) {
      const retryAfterHeader = response.headers.get("Retry-After");
      const error: RateLimitError = Object.assign(new Error("Rate limited"), {
        status: 429,
        retryAfter: retryAfterHeader ? Number.parseInt(retryAfterHeader, 10) : undefined,
      });
      throw error;
    }
    const detail = await response.text();
    throw new Error(detail || `Request failed (${response.status})`);
  }
  return (await response.json()) as { hits: TypeaheadResult[] };
}

export function isRateLimitError(error: unknown): error is RateLimitError {
  return Boolean(error && typeof error === "object" && (error as RateLimitError).status === 429);
}
