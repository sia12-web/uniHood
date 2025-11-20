import { readAuthSnapshot, resolveAuthHeaders } from "@/lib/auth-storage";
import { getBackendUrl } from "@/lib/env";

export type PresenceRecord = {
  user_id: string;
  online: boolean;
  last_seen?: string | null;
};

export type PresenceResponse = {
  items: PresenceRecord[];
};

export async function fetchPresence(userIds: string[]): Promise<PresenceRecord[]> {
  if (userIds.length === 0) {
    return [];
  }
  const snapshot = readAuthSnapshot();
  if (!snapshot) {
    return userIds.map((userId) => ({ user_id: userId, online: false, last_seen: null }));
  }
  const headers = new Headers({ Accept: "application/json" });
  const resolved = resolveAuthHeaders(snapshot);
  for (const [key, value] of Object.entries(resolved)) {
    if (value) {
      headers.set(key, value);
    }
  }
  const url = new URL("/presence/lookup", getBackendUrl());
  url.searchParams.set("ids", userIds.join(","));
  const response = await fetch(url.toString(), {
    method: "GET",
    headers,
    credentials: "include",
    cache: "no-store",
  });
  if (!response.ok) {
    throw new Error(`Presence lookup failed (${response.status})`);
  }
  const payload = (await response.json()) as PresenceResponse;
  return payload.items ?? [];
}
