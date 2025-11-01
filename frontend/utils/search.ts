import type { ReadonlyURLSearchParams } from "next/navigation";

export type SearchScope = "groups" | "posts" | "events";

export type SearchParamsInput = {
  q?: string | null;
  campus_id?: string | null;
  tags?: string[] | null;
  time_from?: string | null;
  time_to?: string | null;
  size?: number | null;
};

export type NormalizedSearchParams = {
  q: string;
  campus_id?: string | null;
  tags: string[];
  time_from?: string | null;
  time_to?: string | null;
  size: number;
};

export function normalizeSearchParams(params: SearchParamsInput | undefined): NormalizedSearchParams {
  const q = params?.q?.trim() ?? "";
  const campus_id = params?.campus_id ? params.campus_id : undefined;
  const tags = params?.tags?.filter(Boolean) ?? [];
  const time_from = params?.time_from ?? undefined;
  const time_to = params?.time_to ?? undefined;
  const size = params?.size && params.size > 0 ? params.size : 20;
  return { q, campus_id, tags, time_from, time_to, size };
}

export function paramsFromSearchParams(searchParams: ReadonlyURLSearchParams): NormalizedSearchParams {
  const q = searchParams.get("q") ?? "";
  const campus_id = searchParams.get("campus") ?? undefined;
  const tags = searchParams.getAll("tags");
  const time_from = searchParams.get("time_from") ?? undefined;
  const time_to = searchParams.get("time_to") ?? undefined;
  const sizeValue = searchParams.get("size");
  const size = sizeValue ? Number.parseInt(sizeValue, 10) : undefined;
  return normalizeSearchParams({ q, campus_id, tags, time_from, time_to, size });
}

export function buildSearchQuery(params: NormalizedSearchParams, extra?: { next?: string | null }): URLSearchParams {
  const search = new URLSearchParams();
  if (params.q) {
    search.set("q", params.q);
  }
  if (params.campus_id) {
    search.set("campus_id", params.campus_id);
  }
  params.tags.forEach((tag) => {
    if (tag) {
      search.append("tags[]", tag);
    }
  });
  if (params.time_from) {
    search.set("time_from", params.time_from);
  }
  if (params.time_to) {
    search.set("time_to", params.time_to);
  }
  if (params.size) {
    search.set("size", String(params.size));
  }
  if (extra?.next) {
    search.set("next", extra.next);
  }
  return search;
}

export function buildUrlParams(params: NormalizedSearchParams, overrides?: Partial<NormalizedSearchParams>): string {
  const merged: NormalizedSearchParams = { ...params, ...overrides, tags: overrides?.tags ?? params.tags };
  const search = new URLSearchParams();
  if (merged.q) {
    search.set("q", merged.q);
  }
  if (merged.campus_id) {
    search.set("campus", merged.campus_id);
  }
  merged.tags.forEach((tag) => {
    if (tag) {
      search.append("tags", tag);
    }
  });
  if (merged.time_from) {
    search.set("time_from", merged.time_from);
  }
  if (merged.time_to) {
    search.set("time_to", merged.time_to);
  }
  if (merged.size) {
    search.set("size", String(merged.size));
  }
  return search.toString();
}

export function makeQueryHash(params: NormalizedSearchParams): string {
  return JSON.stringify({
    q: params.q,
    campus_id: params.campus_id ?? null,
    tags: params.tags,
    time_from: params.time_from ?? null,
    time_to: params.time_to ?? null,
    size: params.size,
  });
}

export function canRunSearch(scope: SearchScope, params: NormalizedSearchParams): boolean {
  if (params.q.trim().length >= 2) {
    return true;
  }
  if (params.tags.length > 0) {
    return true;
  }
  if (params.campus_id) {
    return true;
  }
  if (params.time_from || params.time_to) {
    return true;
  }
  return false;
}

const STRIP_SCRIPTS = /<script[^>]*>[\s\S]*?<\/script>/gi;
const STRIP_STYLES = /<style[^>]*>[\s\S]*?<\/style>/gi;
const REMOVE_TAGS = /<(?!\/?em\b)[^>]*>/gi;
const DISALLOW_ATTRS = /<em[^>]*>/gi;

export function sanitizeHighlight(html?: string | null): string {
  if (!html) {
    return "";
  }
  let safe = html.replace(STRIP_SCRIPTS, "").replace(STRIP_STYLES, "");
  safe = safe.replace(REMOVE_TAGS, "");
  safe = safe.replace(DISALLOW_ATTRS, "<em>");
  const openings = (safe.match(/<em>/g) ?? []).length;
  const closings = (safe.match(/<\/em>/g) ?? []).length;
  if (closings < openings) {
    safe = `${safe}${"</em>".repeat(openings - closings)}`;
  }
  return safe;
}

export function truncateText(value: string | null | undefined, limit = 160): string {
  if (!value) {
    return "";
  }
  if (value.length <= limit) {
    return value;
  }
  return `${value.slice(0, limit - 1)}…`;
}
