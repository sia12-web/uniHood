import "@testing-library/jest-dom/vitest";

import { useEffect } from "react";
import { act, render, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider, type InfiniteData } from "@tanstack/react-query";
import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  NOTIFICATIONS_DROPDOWN_KEY,
  NOTIFICATIONS_LIST_KEY,
  NOTIFICATIONS_UNREAD_KEY,
} from "@/hooks/notifications/keys";
import { useMarkAllNotificationsRead, useMarkNotificationRead } from "@/hooks/notifications/use-mark-read";
import type { NotificationListResponse, NotificationRecord } from "@/lib/notifications";

type MutationRef<T> = { current: T | null };

const { toastPushMock, markNotificationReadMock, markAllNotificationsReadMock } = vi.hoisted(() => ({
  toastPushMock: vi.fn(),
  markNotificationReadMock: vi.fn(async (_id: string) => {}),
  markAllNotificationsReadMock: vi.fn(async () => {}),
}));

vi.mock("@/hooks/use-toast", () => ({
  useToast: () => ({ push: toastPushMock }),
}));

vi.mock("@/lib/notifications", async () => {
  const actual = await vi.importActual<typeof import("@/lib/notifications")>("@/lib/notifications");
  return {
    ...actual,
    markNotificationRead: markNotificationReadMock,
    markAllNotificationsRead: markAllNotificationsReadMock,
  };
});

function createClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
      },
    },
  });
}

function renderWithClient(ui: React.ReactElement) {
  const client = createClient();
  const renderResult = render(<QueryClientProvider client={client}>{ui}</QueryClientProvider>);
  return { client, ...renderResult };
}

type MarkNotificationHook = ReturnType<typeof useMarkNotificationRead>;
type MarkAllHook = ReturnType<typeof useMarkAllNotificationsRead>;

function MarkSingleHarness({ onReady }: { onReady: (mutation: MarkNotificationHook) => void }) {
  const mutation = useMarkNotificationRead();
  useEffect(() => {
    onReady(mutation);
  }, [mutation, onReady]);
  return null;
}

function MarkAllHarness({ onReady }: { onReady: (mutation: MarkAllHook) => void }) {
  const mutation = useMarkAllNotificationsRead();
  useEffect(() => {
    onReady(mutation);
  }, [mutation, onReady]);
  return null;
}

describe("notifications hooks", () => {
  beforeEach(() => {
    markNotificationReadMock.mockReset();
    markAllNotificationsReadMock.mockReset();
    toastPushMock.mockReset();
  });

  it("marks a single notification as read and updates caches", async () => {
    const notification: NotificationRecord = {
      id: "notif-1",
      created_at: new Date().toISOString(),
      is_read: false,
      actor: null,
      entity: { type: "post.comment", ref_id: "post-1", group_id: "group-1", post_id: "post-1" },
      title: "New comment",
      message: "Someone replied",
      verb: null,
      target_url: null,
    };

    const listResponse: NotificationListResponse = {
      items: [notification],
      next_cursor: null,
    };

    const mutationRef: MutationRef<MarkNotificationHook> = { current: null };
    const { client, unmount } = renderWithClient(<MarkSingleHarness onReady={(mutation) => (mutationRef.current = mutation)} />);

    client.setQueryData(NOTIFICATIONS_DROPDOWN_KEY, [notification]);
    client.setQueryData<InfiniteData<NotificationListResponse>>(NOTIFICATIONS_LIST_KEY, {
      pages: [listResponse],
      pageParams: [null],
    });
    client.setQueryData(NOTIFICATIONS_UNREAD_KEY, 1);

    await waitFor(() => expect(mutationRef.current).not.toBeNull());

    await act(async () => {
      await mutationRef.current!.mutateAsync(notification.id);
    });

    const updatedDropdown = client.getQueryData<NotificationRecord[]>(NOTIFICATIONS_DROPDOWN_KEY);
  const updatedList = client.getQueryData<InfiniteData<NotificationListResponse>>(NOTIFICATIONS_LIST_KEY);
    const unreadCount = client.getQueryData<number>(NOTIFICATIONS_UNREAD_KEY);

    expect(markNotificationReadMock).toHaveBeenCalledWith(notification.id);
    expect(updatedDropdown?.[0].is_read).toBe(true);
  expect(updatedList?.pages[0]?.items[0].is_read).toBe(true);
    expect(unreadCount).toBe(0);

    unmount();
  });

  it("marks all notifications as read and updates caches", async () => {
    const notificationA: NotificationRecord = {
      id: "notif-A",
      created_at: new Date().toISOString(),
      is_read: false,
      actor: null,
      entity: { type: "post.comment", ref_id: "post-1", group_id: "group-1", post_id: "post-1" },
      title: "New comment",
      message: "Someone replied",
      verb: null,
      target_url: null,
    };

    const notificationB: NotificationRecord = {
      ...notificationA,
      id: "notif-B",
    };

    const listResponse: NotificationListResponse = {
      items: [notificationA, notificationB],
      next_cursor: null,
    };

    const mutationRef: MutationRef<MarkAllHook> = { current: null };
    const { client, unmount } = renderWithClient(<MarkAllHarness onReady={(mutation) => (mutationRef.current = mutation)} />);

    client.setQueryData(NOTIFICATIONS_DROPDOWN_KEY, [notificationA, notificationB]);
    client.setQueryData<InfiniteData<NotificationListResponse>>(NOTIFICATIONS_LIST_KEY, {
      pages: [listResponse],
      pageParams: [null],
    });
    client.setQueryData(NOTIFICATIONS_UNREAD_KEY, 2);

    await waitFor(() => expect(mutationRef.current).not.toBeNull());

    await act(async () => {
      await mutationRef.current!.mutateAsync();
    });

    const updatedDropdown = client.getQueryData<NotificationRecord[]>(NOTIFICATIONS_DROPDOWN_KEY);
  const updatedList = client.getQueryData<InfiniteData<NotificationListResponse>>(NOTIFICATIONS_LIST_KEY);
    const unreadCount = client.getQueryData<number>(NOTIFICATIONS_UNREAD_KEY);

    expect(markAllNotificationsReadMock).toHaveBeenCalledTimes(1);
    expect(updatedDropdown?.every((item) => item.is_read)).toBe(true);
  expect(updatedList?.pages[0]?.items.every((item) => item.is_read)).toBe(true);
    expect(unreadCount).toBe(0);

    unmount();
  });
});
