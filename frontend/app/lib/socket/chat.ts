import type { Socket } from "socket.io-client";

import { createSocketManager, type SocketConnectionStatus } from "./base";
import { getBackendUrl } from "@/lib/env";

// Allow reading process.env without Node typings in the browser build.
declare const process: { env?: Record<string, string | undefined> } | undefined;

type ChatIdentity = {
  userId: string;
  campusId: string | null;
};

function readSocketBase(): string {
  const candidate =
    (typeof process !== "undefined" && process?.env?.NEXT_PUBLIC_SOCKET_URL) ??
    (typeof globalThis !== "undefined"
      ? (globalThis as { process?: { env?: Record<string, string | undefined> } }).process?.env?.NEXT_PUBLIC_SOCKET_URL
      : undefined);
  if (typeof candidate === "string" && candidate.trim().length > 0) {
    return candidate.trim().replace(/\/$/, "");
  }
  return getBackendUrl().replace(/\/$/, "");
}

const SOCKET_BASE = readSocketBase();

const chatManager = createSocketManager<ChatIdentity>({
  namespace: "/chat",
  endpoint: SOCKET_BASE,
  lowPriorityEvents: ["chat:typing"],
  heartbeatEvent: "hb",
  heartbeatIntervalMs: 15_000,
  hiddenHeartbeatIntervalMs: 45_000,
  buildAuthPayload: (identity, token) => {
    const payload: Record<string, unknown> = {};
    if (identity?.userId) {
      payload.userId = identity.userId;
    }
    if (identity) {
      payload.campusId = identity.campusId ?? null;
    }
    if (token) {
      payload.token = token;
    }
    return payload;
  },
});

export function connectChatSocket(identity: ChatIdentity): Socket | null {
  if (!identity?.userId) {
    return null;
  }
  return chatManager.connect(identity);
}

export function disconnectChatSocket(): void {
  chatManager.disconnect();
}

export function onChatSocketStatus(listener: (status: SocketConnectionStatus) => void): () => void {
  return chatManager.onStatus(listener);
}

export function getChatSocketStatus(): SocketConnectionStatus {
  return chatManager.getStatus();
}

export function getChatSocketInstance(): Socket | null {
  return chatManager.getSocket();
}
