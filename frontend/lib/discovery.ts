import { apiFetch } from "@/app/lib/http/client";
import { getBackendUrl } from "./env";
import type { NearbyUser } from "./types";

const BASE_URL = getBackendUrl().replace(/\/$/, "");

export type DiscoveryFeedResponse = {
  items: NearbyUser[];
  cursor?: string | null;
  exhausted: boolean;
};

export async function fetchDiscoveryFeed(
  userId: string,
  campusId: string,
  opts: { cursor?: string | null; limit?: number } = {},
): Promise<DiscoveryFeedResponse> {
  const params = new URLSearchParams();
  if (opts.cursor) params.set("cursor", opts.cursor);
  if (opts.limit) params.set("limit", String(opts.limit));
  const suffix = params.toString() ? `?${params.toString()}` : "";
  return apiFetch<DiscoveryFeedResponse>(`${BASE_URL}/discovery/feed${suffix}`, {
    headers: {
      "X-User-Id": userId,
      "X-Campus-Id": campusId,
    },
    cache: "no-store",
  });
}

export async function sendDiscoveryLike(
  userId: string,
  campusId: string,
  targetId: string,
  cursor?: string | null,
): Promise<void> {
  await apiFetch(`${BASE_URL}/discovery/like`, {
    method: "POST",
    headers: {
      "X-User-Id": userId,
      "X-Campus-Id": campusId,
    },
    body: { target_id: targetId, cursor: cursor ?? undefined },
  });
}

export async function sendDiscoveryPass(
  userId: string,
  campusId: string,
  targetId: string,
  cursor?: string | null,
): Promise<void> {
  await apiFetch(`${BASE_URL}/discovery/pass`, {
    method: "POST",
    headers: {
      "X-User-Id": userId,
      "X-Campus-Id": campusId,
    },
    body: { target_id: targetId, cursor: cursor ?? undefined },
  });
}

