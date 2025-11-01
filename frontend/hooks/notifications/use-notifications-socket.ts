"use client";

import { useEffect, useRef } from "react";
import { useQueryClient, type InfiniteData } from "@tanstack/react-query";

import { useCommunitiesSocket } from "@/components/providers/socket-provider";
import { useToast } from "@/hooks/use-toast";
import { type NotificationListResponse, type NotificationRecord } from "@/lib/notifications";

import {
  NOTIFICATIONS_DROPDOWN_KEY,
  NOTIFICATIONS_LIST_KEY,
  NOTIFICATIONS_UNREAD_KEY,
} from "./keys";

function upsertDropdown(current: NotificationRecord[] | undefined, incoming: NotificationRecord): NotificationRecord[] {
  const next = [incoming, ...(current ?? []).filter((item) => item.id !== incoming.id)];
  return next.slice(0, 15);
}

function upsertList(
  data: InfiniteData<NotificationListResponse> | undefined,
  incoming: NotificationRecord,
): InfiniteData<NotificationListResponse> | undefined {
  if (!data) {
    return {
      pages: [{ items: [incoming] }],
      pageParams: [undefined],
    };
  }
  return {
    ...data,
    pages: data.pages.map((page, index) => {
      if (index === 0) {
        return {
          ...page,
          items: [incoming, ...page.items.filter((item) => item.id !== incoming.id)],
        };
      }
      return page;
    }),
  };
}

export function useNotificationsSocketBridge() {
  const socket = useCommunitiesSocket();
  const queryClient = useQueryClient();
  const { push } = useToast();
  const lastToastRef = useRef<number>(0);

  useEffect(() => {
    if (!socket) {
      return;
    }

    const handleNew = (payload: NotificationRecord) => {
      const notification: NotificationRecord = {
        ...payload,
        is_read: false,
      };
      queryClient.setQueryData(NOTIFICATIONS_DROPDOWN_KEY, (current: NotificationRecord[] | undefined) =>
        upsertDropdown(current, notification),
      );
      queryClient.setQueryData(NOTIFICATIONS_LIST_KEY, (current: InfiniteData<NotificationListResponse> | undefined) =>
        upsertList(current, notification),
      );
      queryClient.setQueryData<number | undefined>(NOTIFICATIONS_UNREAD_KEY, (current) => (current ?? 0) + 1);

      const now = Date.now();
      if (now - lastToastRef.current > 6_000) {
        lastToastRef.current = now;
        push({
          title: "New notification",
          description: notification.title ?? "You have a new activity update.",
        });
      }
    };

    socket.on("notification.new", handleNew);

    return () => {
      socket.off("notification.new", handleNew);
    };
  }, [push, queryClient, socket]);
}
