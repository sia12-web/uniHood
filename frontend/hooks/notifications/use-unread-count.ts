"use client";

import { useQuery } from "@tanstack/react-query";

import { fetchUnreadCount } from "@/lib/notifications";

import { NOTIFICATIONS_UNREAD_KEY } from "./keys";

export function useUnreadNotificationsCount() {
  return useQuery({
    queryKey: NOTIFICATIONS_UNREAD_KEY,
    queryFn: () => fetchUnreadCount(),
    staleTime: 5_000,
    refetchInterval: 60_000,
  });
}
