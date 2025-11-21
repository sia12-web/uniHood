import React from "react";
import { act, cleanup, render, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { useAutoLivePresence } from "@/hooks/presence/use-auto-live";

const connectPresenceSocket = vi.hoisted(() => vi.fn());
const disconnectPresenceSocket = vi.hoisted(() => vi.fn());
const getPresenceSocketInstance = vi.hoisted(() => vi.fn());
const sendOffline = vi.hoisted(() => vi.fn());
const markPresenceFromActivity = vi.hoisted(() => vi.fn());
const readAuthUser = vi.hoisted(() => vi.fn());

vi.mock("@/app/lib/socket/presence", () => ({
  connectPresenceSocket,
  disconnectPresenceSocket,
  getPresenceSocketInstance,
}));

vi.mock("@/lib/auth-storage", () => ({
  readAuthUser,
}));

vi.mock("@/lib/presence/api", () => ({
  sendOffline,
}));

vi.mock("@/store/presence", () => ({
  markPresenceFromActivity,
}));

function TestHarness({ radius }: { radius?: number }) {
  useAutoLivePresence({ radiusM: radius });
  return null;
}

describe("useAutoLivePresence", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Default to connected socket
    getPresenceSocketInstance.mockReturnValue({
      connected: true,
      emit: vi.fn(),
      on: vi.fn(),
    });
  });

  afterEach(() => {
    cleanup();
  });

  it("does nothing when no authenticated user is present", () => {
    readAuthUser.mockReturnValue(null);

    render(<TestHarness />);

    expect(connectPresenceSocket).not.toHaveBeenCalled();
    expect(getPresenceSocketInstance).not.toHaveBeenCalled();
  });

  it("connects and emits a go-live heartbeat when authenticated", async () => {
    readAuthUser.mockReturnValue({ userId: "user-1", campusId: "campus-1" });
    const emit = vi.fn();
    getPresenceSocketInstance.mockReturnValue({
      connected: true,
      emit,
      on: vi.fn(),
    });

    const { unmount } = render(<TestHarness radius={42} />);

    await waitFor(() => {
      expect(connectPresenceSocket).toHaveBeenCalledWith({ userId: "user-1", campusId: "campus-1" });
    });
    expect(emit).toHaveBeenCalledWith("presence_go_live", { radius_m: 42 });
    expect(markPresenceFromActivity).toHaveBeenCalledWith(
      "user-1",
      expect.objectContaining({ lastSeen: expect.any(String), ttlMs: expect.any(Number) }),
    );

    unmount();

    expect(sendOffline).toHaveBeenCalledWith("user-1", "campus-1");
    expect(disconnectPresenceSocket).toHaveBeenCalled();
  });

  it("registers live presence only after a socket connection is available", async () => {
    readAuthUser.mockReturnValue({ userId: "user-2", campusId: "campus-2" });
    const emit = vi.fn();
    const on = vi.fn();
    getPresenceSocketInstance.mockReturnValue({
      connected: false,
      emit,
      on,
    });

    render(<TestHarness />);

    await waitFor(() => {
      expect(connectPresenceSocket).toHaveBeenCalledWith({ userId: "user-2", campusId: "campus-2" });
    });
  });
});
