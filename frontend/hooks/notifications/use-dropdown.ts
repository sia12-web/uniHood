"use client";

import { useQuery } from "@tanstack/react-query";

import { fetchNotificationsDropdown, type NotificationRecord } from "@/lib/notifications";

import { NOTIFICATIONS_DROPDOWN_KEY } from "./keys";
import { useMarkAllNotificationsRead, useMarkNotificationRead } from "./use-mark-read";
import { useUnreadNotificationsCount } from "./use-unread-count";

export function useNotificationsDropdown() {
  const notificationsQuery = useQuery({
    queryKey: NOTIFICATIONS_DROPDOWN_KEY,
    queryFn: () => fetchNotificationsDropdown(15),
    staleTime: 10_000,
  });

  const unreadQuery = useUnreadNotificationsCount();

  const markOne = useMarkNotificationRead();
  const markAll = useMarkAllNotificationsRead();

  return {
    notifications: notificationsQuery.data ?? ([] as NotificationRecord[]),
    isLoading: notificationsQuery.isLoading,
    isError: notificationsQuery.isError,
    error: notificationsQuery.error,
    refetch: notificationsQuery.refetch,
    unreadCount: unreadQuery.data ?? 0,
    unreadQuery,
    markOne,
    markAll,
  };
}
