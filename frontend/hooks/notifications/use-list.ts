"use client";

import { useMemo } from "react";
import { useInfiniteQuery, type InfiniteData } from "@tanstack/react-query";

import { fetchNotifications, type NotificationListResponse, type NotificationRecord } from "@/lib/notifications";

import { NOTIFICATIONS_LIST_KEY } from "./keys";

export type NotificationsPage = NotificationListResponse;

export function useNotificationsList() {
  const query = useInfiniteQuery<NotificationListResponse>({
    queryKey: NOTIFICATIONS_LIST_KEY,
    queryFn: ({ pageParam }) => fetchNotifications({ after: (pageParam as string | undefined) ?? null, limit: 20 }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (page) => page.next_cursor ?? undefined,
    staleTime: 10_000,
  });

  const items = useMemo(() => flattenNotifications(query.data), [query.data]);

  return {
    ...query,
    items,
  };
}

export function flattenNotifications(data?: InfiniteData<NotificationListResponse>): NotificationRecord[] {
  if (!data) {
    return [];
  }
  return data.pages.flatMap((page) => page.items);
}
