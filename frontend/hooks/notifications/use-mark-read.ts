"use client";

import { useMutation, useQueryClient, type InfiniteData } from "@tanstack/react-query";

import {
  markAllNotificationsRead,
  markNotificationRead,
  type NotificationListResponse,
  type NotificationRecord,
} from "@/lib/notifications";
import { useToast } from "@/hooks/use-toast";

import {
  NOTIFICATIONS_DROPDOWN_KEY,
  NOTIFICATIONS_LIST_KEY,
  NOTIFICATIONS_UNREAD_KEY,
} from "./keys";

function updateDropdownRead(items: NotificationRecord[] | undefined, notificationId: string, isRead: boolean) {
  if (!items) {
    return items;
  }
  return items.map((item) => (item.id === notificationId ? { ...item, is_read: isRead } : item));
}

function updateDropdownAllRead(items: NotificationRecord[] | undefined) {
  if (!items) {
    return items;
  }
  return items.map((item) => ({ ...item, is_read: true }));
}

function updateListRead(
  data: InfiniteData<NotificationListResponse> | undefined,
  notificationId: string,
  isRead: boolean,
): InfiniteData<NotificationListResponse> | undefined {
  if (!data) {
    return data;
  }
  return {
    ...data,
    pages: data.pages.map((page) => ({
      ...page,
      items: page.items.map((item) => (item.id === notificationId ? { ...item, is_read: isRead } : item)),
    })),
  };
}

function updateListAllRead(
  data: InfiniteData<NotificationListResponse> | undefined,
): InfiniteData<NotificationListResponse> | undefined {
  if (!data) {
    return data;
  }
  return {
    ...data,
    pages: data.pages.map((page) => ({
      ...page,
      items: page.items.map((item) => ({ ...item, is_read: true })),
    })),
  };
}

function wasNotificationUnread(items: NotificationRecord[] | undefined, notificationId: string): boolean {
  if (!items) {
    return false;
  }
  const item = items.find((entry) => entry.id === notificationId);
  return item ? !item.is_read : false;
}

export function useMarkNotificationRead() {
  const queryClient = useQueryClient();
  const toast = useToast();

  return useMutation<void, unknown, string, {
    previousDropdown?: NotificationRecord[];
    previousList?: InfiniteData<NotificationListResponse>;
    previousUnread?: number;
    changed: boolean;
  }>({
    mutationFn: async (notificationId: string) => {
      await markNotificationRead(notificationId);
    },
    onMutate: async (notificationId) => {
      await queryClient.cancelQueries({ queryKey: NOTIFICATIONS_DROPDOWN_KEY });
      await queryClient.cancelQueries({ queryKey: NOTIFICATIONS_LIST_KEY });
      await queryClient.cancelQueries({ queryKey: NOTIFICATIONS_UNREAD_KEY });

      const previousDropdown = queryClient.getQueryData<NotificationRecord[]>(NOTIFICATIONS_DROPDOWN_KEY);
      const previousList = queryClient.getQueryData<InfiniteData<NotificationListResponse>>(NOTIFICATIONS_LIST_KEY);
      const previousUnread = queryClient.getQueryData<number>(NOTIFICATIONS_UNREAD_KEY);

      const changed = wasNotificationUnread(previousDropdown, notificationId);

      queryClient.setQueryData(NOTIFICATIONS_DROPDOWN_KEY, (current: NotificationRecord[] | undefined) =>
        updateDropdownRead(current, notificationId, true),
      );
      queryClient.setQueryData(NOTIFICATIONS_LIST_KEY, (current: InfiniteData<NotificationListResponse> | undefined) =>
        updateListRead(current, notificationId, true),
      );
      if (changed) {
        queryClient.setQueryData<number | undefined>(NOTIFICATIONS_UNREAD_KEY, (current) => {
          const next = (current ?? 0) - 1;
          return next > 0 ? next : 0;
        });
      }

      return { previousDropdown, previousList, previousUnread, changed };
    },
    onError: (_error, notificationId, context) => {
      if (context?.previousDropdown !== undefined) {
        queryClient.setQueryData(NOTIFICATIONS_DROPDOWN_KEY, context.previousDropdown);
      }
      if (context?.previousList !== undefined) {
        queryClient.setQueryData(NOTIFICATIONS_LIST_KEY, context.previousList);
      }
      if (context?.previousUnread !== undefined) {
        queryClient.setQueryData(NOTIFICATIONS_UNREAD_KEY, context.previousUnread);
      }
      toast.push({
        title: "Unable to update notification",
        description: "Please try again in a moment.",
        variant: "error",
      });
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: NOTIFICATIONS_UNREAD_KEY });
    },
  });
}

export function useMarkAllNotificationsRead() {
  const queryClient = useQueryClient();
  const toast = useToast();

  return useMutation<void, unknown, void, {
    previousDropdown?: NotificationRecord[];
    previousList?: InfiniteData<NotificationListResponse>;
    previousUnread?: number;
  }>({
    mutationFn: async () => {
      await markAllNotificationsRead();
    },
    onMutate: async () => {
      await queryClient.cancelQueries({ queryKey: NOTIFICATIONS_DROPDOWN_KEY });
      await queryClient.cancelQueries({ queryKey: NOTIFICATIONS_LIST_KEY });
      await queryClient.cancelQueries({ queryKey: NOTIFICATIONS_UNREAD_KEY });

      const previousDropdown = queryClient.getQueryData<NotificationRecord[]>(NOTIFICATIONS_DROPDOWN_KEY);
      const previousList = queryClient.getQueryData<InfiniteData<NotificationListResponse>>(NOTIFICATIONS_LIST_KEY);
      const previousUnread = queryClient.getQueryData<number>(NOTIFICATIONS_UNREAD_KEY);

      queryClient.setQueryData(NOTIFICATIONS_DROPDOWN_KEY, (current: NotificationRecord[] | undefined) =>
        updateDropdownAllRead(current),
      );
      queryClient.setQueryData(NOTIFICATIONS_LIST_KEY, (current: InfiniteData<NotificationListResponse> | undefined) =>
        updateListAllRead(current),
      );
      queryClient.setQueryData<number | undefined>(NOTIFICATIONS_UNREAD_KEY, () => 0);

      return { previousDropdown, previousList, previousUnread };
    },
    onError: (_error, _variables, context) => {
      if (context?.previousDropdown !== undefined) {
        queryClient.setQueryData(NOTIFICATIONS_DROPDOWN_KEY, context.previousDropdown);
      }
      if (context?.previousList !== undefined) {
        queryClient.setQueryData(NOTIFICATIONS_LIST_KEY, context.previousList);
      }
      if (context?.previousUnread !== undefined) {
        queryClient.setQueryData(NOTIFICATIONS_UNREAD_KEY, context.previousUnread);
      }
      toast.push({
        title: "Unable to mark all notifications",
        description: "We could not complete this action. Please try again.",
        variant: "error",
      });
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: NOTIFICATIONS_UNREAD_KEY });
      queryClient.invalidateQueries({ queryKey: NOTIFICATIONS_DROPDOWN_KEY });
      queryClient.invalidateQueries({ queryKey: NOTIFICATIONS_LIST_KEY });
    },
  });
}
