import { act, render, waitFor } from "@testing-library/react";
import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { ChatMessage } from "@/lib/chat";

const messageHandlers: Array<(message: ChatMessage) => void> = [];

const socketOn = vi.fn();
const socketOff = vi.fn();
const socketEmit = vi.fn();

const socketMock = {
  on: socketOn,
  off: socketOff,
  emit: socketEmit,
};

const initChatSocketMock = vi.fn(() => socketMock);

const onMessageMock = vi.fn((handler: (message: ChatMessage) => void) => {
  messageHandlers.push(handler);
  return () => {
    const index = messageHandlers.indexOf(handler);
    if (index >= 0) {
      messageHandlers.splice(index, 1);
    }
  };
});

const onDeliveredMock = vi.fn(() => () => undefined);

let clientMsgIdCounter = 0;
const newClientMessageIdMock = vi.fn(() => {
  clientMsgIdCounter += 1;
  return `client-generated-${clientMsgIdCounter}`;
});

vi.mock("@/components/ChatWindow", () => ({
  __esModule: true,
  default: () => <div data-testid="chat-window" />,
}));

vi.mock("@/hooks/presence/use-presence", () => ({
  __esModule: true,
  usePresenceForUser: () => null,
}));

vi.mock("@/lib/env", () => ({
  __esModule: true,
  getBackendUrl: () => "https://api.example",
  getDemoUserId: () => "demo-user",
  getDemoCampusId: () => "demo-campus",
  // Disable dev proxy in tests to keep absolute URLs stable
  isDevApiProxyEnabled: () => false,
}));

vi.mock("@/lib/auth-storage", () => ({
  __esModule: true,
  readAuthUser: () => null,
  onAuthChange: () => () => undefined,
}));

vi.mock("@/lib/chat", () => ({
  __esModule: true,
  initChatSocket: initChatSocketMock,
  onMessage: onMessageMock,
  onDelivered: onDeliveredMock,
  newClientMessageId: newClientMessageIdMock,
}));

const originalFetch = global.fetch;
let fetchMock: ReturnType<typeof vi.fn>;

function createJsonResponse(body: unknown, status = 200) {
  return Promise.resolve({
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  } as Response);
}

describe("ChatPage delivery acknowledgements", () => {
  beforeEach(async () => {
    messageHandlers.length = 0;
    socketOn.mockClear();
    socketOff.mockClear();
    socketEmit.mockClear();
    initChatSocketMock.mockClear();
    onMessageMock.mockClear();
    onDeliveredMock.mockClear();
    newClientMessageIdMock.mockClear();
    clientMsgIdCounter = 0;

    fetchMock = vi.fn((input: RequestInfo | URL) => {
      const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
      if (url.includes("/messages")) {
        return createJsonResponse({ items: [] });
      }
      if (url.includes("/deliveries")) {
        return createJsonResponse({ conversation_id: "chat:demo-user:friend", delivered_seq: 5 });
      }
      throw new Error(`Unexpected fetch call to ${url}`);
    });
    global.fetch = fetchMock as unknown as typeof fetch;
  });

  afterEach(() => {
    global.fetch = originalFetch;
    fetchMock.mockClear();
  });

  it("acknowledges incoming messages and honours server delivered_seq", async () => {
    const { default: ChatPage } = await import("@/app/(chat)/chat/[peerid]/page");

    render(<ChatPage params={{ peerId: "friend" }} />);

    await waitFor(() => expect(onMessageMock).toHaveBeenCalled());
    expect(messageHandlers.length).toBeGreaterThan(0);
    const handleMessage = messageHandlers[messageHandlers.length - 1];

    const incoming: ChatMessage = {
      messageId: "server-1",
      clientMsgId: "peer-1",
      seq: 1,
      conversationId: "chat:demo-user:friend",
      senderId: "friend",
      recipientId: "demo-user",
      body: "Hello",
      attachments: [],
      createdAt: new Date().toISOString(),
    };

    await act(async () => {
      handleMessage(incoming);
    });

    await waitFor(() => {
      const ackCalls = fetchMock.mock.calls.filter(([request]) => {
        const url = typeof request === "string" ? request : request instanceof URL ? request.toString() : request.url;
        return url.includes("/deliveries");
      });
      expect(ackCalls.length).toBe(1);
    });

    const ackCall = fetchMock.mock.calls.find(([request]) => {
      const url = typeof request === "string" ? request : request instanceof URL ? request.toString() : request.url;
      return url.includes("/deliveries");
    });
    expect(ackCall).toBeDefined();
    const ackInit = ackCall?.[1];
    expect(ackInit).toMatchObject({ method: "POST" });
    expect(JSON.parse((ackInit?.body as string) ?? "{}")).toEqual({ delivered_seq: incoming.seq });

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));

    const laterIncoming: ChatMessage = {
      ...incoming,
      messageId: "server-2",
      clientMsgId: "peer-2",
      seq: 3,
      createdAt: new Date().toISOString(),
    };

    await act(async () => {
      handleMessage(laterIncoming);
    });

    await new Promise((resolve) => setTimeout(resolve, 0));

    const deliveryCalls = fetchMock.mock.calls.filter(([request]) => {
      const url = typeof request === "string" ? request : request instanceof URL ? request.toString() : request.url;
      return url.includes("/deliveries");
    });
    const deliverySeqs = deliveryCalls.map(([, init]) => {
      const parsed = JSON.parse((init?.body as string) ?? "{}");
      return parsed.delivered_seq;
    });
    expect(deliverySeqs).toEqual([incoming.seq]);
  });
});
