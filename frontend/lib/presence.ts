import { API_BASE, api } from "./api";

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
  if (process.env.NODE_ENV !== "production" && API_BASE === "/api/communities/v1") {
    return [];
  }
  const search = new URLSearchParams();
  search.set("ids", userIds.join(","));
  const response = await api.get<PresenceResponse>(`/presence?${search.toString()}`);
  return response.data.items ?? [];
}
