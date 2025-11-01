import { api } from "./api";

export type NotificationActor = {
  id: string;
  display_name?: string | null;
  handle?: string | null;
  avatar_url?: string | null;
};

export type NotificationEntityType =
  | "post.comment"
  | "post.reaction"
  | "post.created"
  | "event.rsvp.promoted"
  | string;

export type NotificationEntity = {
  type: NotificationEntityType;
  ref_id: string;
  group_id?: string | null;
  post_id?: string | null;
};

export type NotificationRecord = {
  id: string;
  created_at: string;
  is_read: boolean;
  actor?: NotificationActor | null;
  entity: NotificationEntity;
  title?: string | null;
  message?: string | null;
  verb?: string | null;
  target_url?: string | null;
};

export type NotificationListResponse = {
  items: NotificationRecord[];
  next_cursor?: string | null;
};

export type UnreadCountResponse = {
  count: number;
};

export async function fetchNotifications(params?: { after?: string | null; limit?: number }): Promise<NotificationListResponse> {
  const search = new URLSearchParams();
  if (params?.after) {
    search.set("after", params.after);
  }
  if (params?.limit) {
    search.set("limit", String(params.limit));
  }
  const suffix = search.toString();
  const url = suffix ? `/notifications?${suffix}` : "/notifications";
  const response = await api.get<NotificationListResponse>(url);
  return response.data;
}

export async function fetchNotificationsDropdown(limit = 15): Promise<NotificationRecord[]> {
  const response = await fetchNotifications({ limit });
  return response.items.slice(0, limit);
}

export async function fetchUnreadCount(): Promise<number> {
  const response = await api.get<UnreadCountResponse>("/notifications/unread_count");
  return response.data.count ?? 0;
}

export async function markNotificationRead(notificationId: string): Promise<void> {
  await api.post(`/notifications/${notificationId}/read`);
}

export async function markAllNotificationsRead(): Promise<void> {
  await api.post("/notifications/read_all");
}
