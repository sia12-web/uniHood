import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { initChatSocket, disconnectChatSocket } from "@/lib/chat";

const connectChatSocket = vi.hoisted(() => vi.fn());
const disconnectChatSocketBase = vi.hoisted(() => vi.fn());
const getChatSocketInstance = vi.hoisted(() => vi.fn());

vi.mock("@/app/lib/socket/chat", () => ({
  connectChatSocket,
  disconnectChatSocket: disconnectChatSocketBase,
  getChatSocketInstance,
  getChatSocketStatus: vi.fn(),
  onChatSocketStatus: vi.fn(),
}));

const mockSocket = {
  on: vi.fn(),
  off: vi.fn(),
};

describe("initChatSocket", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    disconnectChatSocket();
  });

  it("throws when user id is missing", () => {
    expect(() => initChatSocket("http://localhost:8000", "", "campus-1")).toThrow(
      "Chat socket unavailable: missing user id",
    );
  });

  it("connects once and reuses the existing socket instance", () => {
    connectChatSocket.mockReturnValue(mockSocket as any);

    const first = initChatSocket("http://localhost:8000", "user-1", "campus-1");
    const second = initChatSocket("http://localhost:8000", "user-1", "campus-1");

    expect(first).toBe(mockSocket);
    expect(second).toBe(mockSocket);
    expect(connectChatSocket).toHaveBeenCalledTimes(1);
    expect(connectChatSocket).toHaveBeenCalledWith({ userId: "user-1", campusId: "campus-1" });
  });
});
