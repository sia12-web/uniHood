import "@testing-library/jest-dom/vitest";

import { act, render, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider, type InfiniteData } from "@tanstack/react-query";
import { EventEmitter } from "events";
import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  NOTIFICATIONS_DROPDOWN_KEY,
  NOTIFICATIONS_LIST_KEY,
  NOTIFICATIONS_UNREAD_KEY,
} from "@/hooks/notifications/keys";
import { useInviteNotificationBridge } from "@/hooks/notifications/use-invite-bridge";
import type { NotificationListResponse, NotificationRecord } from "@/lib/notifications";
import type { InviteSummary } from "@/lib/types";

const pushMock = vi.fn();
const mockSocket = new EventEmitter();

vi.mock("@/hooks/use-toast", () => ({
  useToast: () => ({ push: pushMock }),
}));

vi.mock("@/lib/auth-storage", () => ({
  readAuthUser: () => ({ userId: "user-1", campusId: "campus-1" }),
  onAuthChange: () => () => undefined,
}));

vi.mock("@/lib/socket", () => ({
  getSocialSocket: () => mockSocket,
}));

function createClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
      },
    },
  });
}

function Harness() {
  useInviteNotificationBridge();
  return null;
}

describe("useInviteNotificationBridge", () => {
  beforeEach(() => {
    pushMock.mockReset();
    mockSocket.removeAllListeners();
    delete (mockSocket as Record<string, unknown>).__inviteNotificationBridgeCount;
  });

  it("adds incoming invites to notification caches", async () => {
    const client = createClient();
    render(
      <QueryClientProvider client={client}>
        <Harness />
      </QueryClientProvider>,
    );

    await waitFor(() => expect(mockSocket.listenerCount("invite:new")).toBeGreaterThan(0));

    const invite: InviteSummary = {
      id: "invite-1",
      from_user_id: "friend-1",
      to_user_id: "user-1",
      status: "sent",
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      expires_at: new Date(Date.now() + 86_400_000).toISOString(),
      from_display_name: "Lily",
      from_handle: "lily",
      to_display_name: "User",
      to_handle: "user",
    };

    act(() => {
      mockSocket.emit("invite:new", invite);
    });

    const dropdown = client.getQueryData<NotificationRecord[]>(NOTIFICATIONS_DROPDOWN_KEY);
    expect(dropdown?.[0]?.id).toBe(`social-invite-${invite.id}`);
    expect(dropdown?.[0]?.title).toMatch(/sent you an invite/);

    const list = client.getQueryData<InfiniteData<NotificationListResponse>>(NOTIFICATIONS_LIST_KEY);
    expect(list?.pages[0]?.items[0]?.id).toBe(`social-invite-${invite.id}`);

    const unread = client.getQueryData<number>(NOTIFICATIONS_UNREAD_KEY);
    expect(unread).toBe(1);
    expect(pushMock).toHaveBeenCalledTimes(1);

    act(() => {
      mockSocket.emit("invite:new", invite);
    });

    const unreadAfterDuplicate = client.getQueryData<number>(NOTIFICATIONS_UNREAD_KEY);
    expect(unreadAfterDuplicate).toBe(1);
    expect(pushMock).toHaveBeenCalledTimes(1);
  });
});
