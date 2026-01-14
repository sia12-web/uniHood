import type { Socket } from "socket.io-client";

import { createSocketManager, type SocketConnectionStatus } from "./base";
import { getBackendUrl } from "@/lib/env";
import { readAuthSnapshot } from "@/lib/auth-storage";

// Mirror env.ts pattern for reading process.env without Node typings.
declare const process: { env?: Record<string, string | undefined> } | undefined;

type PresenceIdentity = {
  userId: string;
  campusId: string | null;
};

type NearbyEventPayload<T> = {
  cursor?: string | null;
  items?: T[];
};

type WithUserId = { user_id: string };

type NearbyAccumulator<T extends WithUserId> = {
  cursor: string | null;
  order: string[];
  entries: Map<string, T>;
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
  const backend = getBackendUrl();
  try {
    const url = new URL(backend);
    return url.origin;
  } catch {
    return backend.replace(/\/$/, "");
  }
}

const SOCKET_BASE = readSocketBase();

const presenceManager = createSocketManager<PresenceIdentity>({
  namespace: "/presence",
  endpoint: SOCKET_BASE,
  lowPriorityEvents: ["presence:typing", "nearby:typing", "presence:hb"],
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

export function connectPresenceSocket(identity: PresenceIdentity): Socket | null {
  const snapshot = readAuthSnapshot();
  if (!identity?.userId || !identity.campusId || !snapshot?.access_token) {
    return null;
  }
  return presenceManager.connect(identity);
}

export function disconnectPresenceSocket(): void {
  presenceManager.disconnect();
}

export function onPresenceSocketStatus(listener: (status: SocketConnectionStatus) => void): () => void {
  return presenceManager.onStatus(listener);
}

export function getPresenceSocketStatus(): SocketConnectionStatus {
  return presenceManager.getStatus();
}

export function getPresenceSocketInstance(): Socket | null {
  return presenceManager.getSocket();
}

export function initialiseNearbyAccumulator<T extends WithUserId>(): NearbyAccumulator<T> {
  return {
    cursor: null,
    order: [],
    entries: new Map<string, T>(),
  };
}

export function applyNearbyEvent<T extends WithUserId>(
  state: NearbyAccumulator<T>,
  payload: NearbyEventPayload<T>,
): NearbyAccumulator<T> {
  const next = {
    cursor: state.cursor,
    order: state.order.slice(),
    entries: new Map(state.entries),
  } satisfies NearbyAccumulator<T>;

  if (payload.cursor && typeof payload.cursor === "string") {
    next.cursor = payload.cursor;
  }

  if (Array.isArray(payload.items)) {
    for (const item of payload.items) {
      if (!item || typeof item.user_id !== "string" || item.user_id.length === 0) {
        continue;
      }
      if (!next.entries.has(item.user_id)) {
        next.order.push(item.user_id);
      }
      next.entries.set(item.user_id, item);
    }
  }

  return next;
}

export function nearbyAccumulatorToArray<T extends WithUserId>(state: NearbyAccumulator<T>): T[] {
  return state.order.map((userId) => state.entries.get(userId)).filter((entry): entry is T => Boolean(entry));
}
