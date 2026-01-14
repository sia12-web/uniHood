import type { Socket } from "socket.io-client";

import { createSocketManager, type SocketConnectionStatus } from "./base";
import { getBackendUrl } from "@/lib/env";

// Read process.env without relying on Node typings.
declare const process: { env?: Record<string, string | undefined> } | undefined;

type EmptyIdentity = Record<string, never>;

function readSocketBase(): string {
  const candidate =
    (typeof process !== "undefined" && process?.env?.NEXT_PUBLIC_SOCKET_URL) ??
    (typeof globalThis !== "undefined"
      ? (globalThis as { process?: { env?: Record<string, string | undefined> } }).process?.env?.NEXT_PUBLIC_SOCKET_URL
      : undefined);
  if (typeof candidate === "string" && candidate.trim().length > 0) {
    return candidate.trim().replace(/\/$/, "");
  }
  const backend = getBackendUrl();
  try {
    const url = new URL(backend);
    return url.origin;
  } catch {
    return backend.replace(/\/$/, "");
  }
}

const SOCKET_BASE = readSocketBase();

const roomsManager = createSocketManager<EmptyIdentity>({
  namespace: "/rooms",
  endpoint: SOCKET_BASE,
  lowPriorityEvents: ["room:typing"],
  heartbeatEvent: "hb",
  heartbeatIntervalMs: 25_000,
  hiddenHeartbeatIntervalMs: 60_000,
  buildAuthPayload: (_, token) => {
    if (token) {
      return { token };
    }
    return {};
  },
});

export function connectRoomsSocket(): Socket | null {
  return roomsManager.connect({});
}

export function disconnectRoomsSocket(): void {
  roomsManager.disconnect();
}

export function onRoomsSocketStatus(listener: (status: SocketConnectionStatus) => void): () => void {
  return roomsManager.onStatus(listener);
}

export function getRoomsSocketStatus(): SocketConnectionStatus {
  return roomsManager.getStatus();
}

export function getRoomsSocketInstance(): Socket | null {
  return roomsManager.getSocket();
}
