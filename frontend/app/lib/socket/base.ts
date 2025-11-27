import { io, type Socket } from "socket.io-client";

import { apiFetch } from "../http/client";
import { readAuthSnapshot } from "@/lib/auth-storage";

export type SocketConnectionStatus = "idle" | "connecting" | "connected" | "reconnecting" | "disconnected";

type MaybePromise<T> = T | Promise<T>;

type OutboundMessage = {
  event: string;
  args: unknown[];
  priority: "low" | "normal";
};

export type SocketManagerOptions<Identity> = {
  namespace: string;
  endpoint: string;
  queueLimit?: number;
  lowPriorityEvents?: string[];
  heartbeatEvent?: string;
  heartbeatIntervalMs?: number;
  hiddenHeartbeatIntervalMs?: number;
  buildAuthPayload?: (identity: Identity | null, token: string | null) => MaybePromise<Record<string, unknown>>;
};

export type SocketManager<Identity> = {
  connect(identity: Identity): Socket | null;
  disconnect(): void;
  onStatus(listener: (status: SocketConnectionStatus) => void): () => void;
  getStatus(): SocketConnectionStatus;
  getSocket(): Socket | null;
};

const DEFAULT_QUEUE_LIMIT = 200;
const DEFAULT_HEARTBEAT_VISIBLE_MS = 15_000;
const DEFAULT_HEARTBEAT_HIDDEN_MS = 45_000;
const RECONNECT_BASE_DELAY_MS = 1_000;
const RECONNECT_MAX_DELAY_MS = 8_000;
const RECONNECT_JITTER_FACTOR = 0.3;
const STABLE_RESET_WINDOW_MS = 60_000;

export function createSocketManager<Identity>(options: SocketManagerOptions<Identity>): SocketManager<Identity> {
  let socket: Socket | null = null;
  let originalEmit: Socket["emit"] | null = null;
  let identity: Identity | null = null;
  let identityKey: string | null = null;
  let shouldReconnect = true;
  let status: SocketConnectionStatus = "idle";
  let connecting = false;
  let reconnectAttempt = 0;
  let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  let heartbeatTimer: ReturnType<typeof setInterval> | null = null;
  let visibilityListener: (() => void) | null = null;
  let onlineListenerAttached = false;
  let onlineHandler: (() => void) | null = null;
  let lastStableAt = 0;

  const statusListeners = new Set<(next: SocketConnectionStatus) => void>();
  const lowPriorityEvents = new Set(options.lowPriorityEvents ?? []);
  const outboundQueue: OutboundMessage[] = [];

  async function fetchRealtimeTicket(): Promise<string | null> {
    if (typeof window === "undefined") {
      return null;
    }
    try {
      const response = await apiFetch<{ ticket?: string; expires_at?: string; expires_in?: number }>("/realtime/ticket", {
        method: "POST",
      });
      const ticket = typeof response?.ticket === "string" ? response.ticket : undefined;
      if (!ticket) {
        return null;
      }
      return ticket;
    } catch {
      return null;
    }
  }

  function getEndpoint(): string | null {
    const base = options.endpoint?.trim?.();
    if (!base) {
      return null;
    }
    return base.endsWith("/") ? base.slice(0, -1) : base;
  }

  function getNamespace(): string {
    const ns = options.namespace?.trim?.() ?? "";
    if (!ns) {
      return "/";
    }
    return ns.startsWith("/") ? ns : `/${ns}`;
  }

  function ensureSocket(): Socket | null {
    if (typeof window === "undefined") {
      return null;
    }
    if (socket) {
      return socket;
    }
    const endpoint = getEndpoint();
    if (!endpoint) {
      return null;
    }
    const target = `${endpoint}${getNamespace()}`;
    socket = io(target, {
      transports: ["websocket"],
      withCredentials: true,
      autoConnect: false,
      forceNew: false,
    });
    originalEmit = socket.emit.bind(socket);
    socket.emit = ((event: string, ...args: unknown[]) => {
      if (socket && socket.connected && status === "connected" && originalEmit) {
        originalEmit(event, ...args);
      } else {
        enqueueOutbound({
          event,
          args,
          priority: lowPriorityEvents.has(event) ? "low" : "normal",
        });
      }
      return socket as Socket;
    }) as Socket["emit"];
    attachSocketHandlers(socket);
    attachOnlineListener();
    return socket;
  }

  function attachOnlineListener(): void {
    if (onlineListenerAttached || typeof window === "undefined") {
      return;
    }
    onlineHandler = () => {
      if (status === "reconnecting" || status === "disconnected") {
        scheduleReconnect(true);
      }
    };
    window.addEventListener("online", onlineHandler);
    onlineListenerAttached = true;
  }

  function detachOnlineListener(): void {
    if (!onlineListenerAttached || typeof window === "undefined") {
      return;
    }
    if (onlineHandler) {
      window.removeEventListener("online", onlineHandler);
    }
    onlineHandler = null;
    onlineListenerAttached = false;
  }

  function updateStatus(next: SocketConnectionStatus): void {
    if (status === next) {
      return;
    }
    status = next;
    statusListeners.forEach((listener) => {
      try {
        listener(next);
      } catch {
        // ignore listener failures
      }
    });
  }

  function enqueueOutbound(message: OutboundMessage): void {
    outboundQueue.push(message);
    const queueLimit = options.queueLimit ?? DEFAULT_QUEUE_LIMIT;
    if (outboundQueue.length <= queueLimit) {
      return;
    }
    const droppableIndex = outboundQueue.findIndex((entry) => entry.priority === "low");
    if (droppableIndex >= 0) {
      outboundQueue.splice(droppableIndex, 1);
      return;
    }
    outboundQueue.shift();
  }

  function flushQueue(): void {
    if (!socket || !socket.connected || !originalEmit) {
      return;
    }
    while (outboundQueue.length) {
      const next = outboundQueue.shift();
      if (!next) {
        break;
      }
      originalEmit(next.event, ...next.args);
    }
  }

  function clearHeartbeat(): void {
    if (heartbeatTimer) {
      clearInterval(heartbeatTimer);
      heartbeatTimer = null;
    }
    if (visibilityListener && typeof document !== "undefined") {
      document.removeEventListener("visibilitychange", visibilityListener);
    }
    visibilityListener = null;
  }

  function scheduleHeartbeat(): void {
    clearHeartbeat();
    if (!socket || !socket.connected) {
      return;
    }
    const event = options.heartbeatEvent ?? "hb";
    const visible = typeof document === "undefined" ? true : document.visibilityState === "visible";
    const interval = visible
      ? options.heartbeatIntervalMs ?? DEFAULT_HEARTBEAT_VISIBLE_MS
      : options.hiddenHeartbeatIntervalMs ?? DEFAULT_HEARTBEAT_HIDDEN_MS;
    heartbeatTimer = setInterval(() => {
      if (!socket || !socket.connected || !originalEmit) {
        clearHeartbeat();
        return;
      }
      try {
        originalEmit(event);
      } catch {
        // ignore heartbeat failures
      }
    }, interval);
    if (typeof document !== "undefined") {
      visibilityListener = () => {
        if (!socket || !socket.connected) {
          return;
        }
        scheduleHeartbeat();
      };
      document.addEventListener("visibilitychange", visibilityListener);
    }
  }

  async function buildAuthPayload(): Promise<Record<string, unknown>> {
    const snapshot = typeof window !== "undefined" ? readAuthSnapshot() : null;
    const token = snapshot?.access_token ?? null;
    let base: Record<string, unknown> = {};
    if (typeof options.buildAuthPayload === "function") {
      try {
        base = (await options.buildAuthPayload(identity, token)) ?? {};
      } catch {
        base = {};
      }
    } else if (identity && typeof identity === "object") {
      base = { ...(identity as Record<string, unknown>) };
    }
    const ticket = await fetchRealtimeTicket();
    if (ticket && token) {
      return { ...base, ticket, token };
    }
    if (ticket) {
      return { ...base, ticket };
    }
    if (token) {
      return { ...base, token };
    }
    // If we cannot authenticate, surface a failure so the caller can avoid looping unauthenticated connects.
    throw new Error("socket_auth_missing");
  }

  function hasIdentityChanged(next: Identity): boolean {
    const nextKey = JSON.stringify(next ?? null);
    if (identityKey === null) {
      identityKey = nextKey;
      return false;
    }
    if (identityKey !== nextKey) {
      identityKey = nextKey;
      return true;
    }
    return false;
  }

  function attachSocketHandlers(instance: Socket): void {
    instance.on("connect", () => {
      reconnectAttempt = 0;
      lastStableAt = Date.now();
      connecting = false;
      updateStatus("connected");
      flushQueue();
      scheduleHeartbeat();
    });

    instance.on("disconnect", (reason) => {
      clearHeartbeat();
      connecting = false;
      if (!shouldReconnect || reason === "io client disconnect") {
        updateStatus("disconnected");
        return;
      }
      updateStatus("reconnecting");
      scheduleReconnect();
    });

    instance.on("connect_error", () => {
      clearHeartbeat();
      connecting = false;
      if (!shouldReconnect) {
        updateStatus("disconnected");
        return;
      }
      updateStatus("reconnecting");
      scheduleReconnect();
    });
  }

  function scheduleReconnect(forceImmediate = false): void {
    if (!shouldReconnect || !identity) {
      return;
    }
    if (connecting) {
      return;
    }
    if (reconnectTimer) {
      if (forceImmediate) {
        clearTimeout(reconnectTimer);
        reconnectTimer = null;
      } else {
        return;
      }
    }
    if (forceImmediate) {
      reconnectAttempt = Math.max(0, reconnectAttempt - 1);
    }
    const now = Date.now();
    if (lastStableAt && now - lastStableAt > STABLE_RESET_WINDOW_MS) {
      reconnectAttempt = 0;
    }
    const attempt = reconnectAttempt;
    reconnectAttempt += 1;
    const baseDelay = Math.min(RECONNECT_MAX_DELAY_MS, RECONNECT_BASE_DELAY_MS * 2 ** attempt);
    const jitter = baseDelay * RECONNECT_JITTER_FACTOR * Math.random();
    const delay = forceImmediate ? 0 : Math.round(baseDelay + jitter);
    reconnectTimer = setTimeout(() => {
      reconnectTimer = null;
      void startConnection(true);
    }, delay);
  }

  async function startConnection(isReconnect: boolean): Promise<void> {
    if (!identity) {
      return;
    }
    const instance = ensureSocket();
    if (!instance) {
      return;
    }
    if (instance.connected || connecting) {
      return;
    }
    connecting = true;
    try {
      const auth = await buildAuthPayload();
      instance.auth = auth;
      updateStatus(isReconnect ? "reconnecting" : "connecting");
      instance.connect();
    } catch (err) {
      connecting = false;
      // If we cannot build auth (no token/ticket), move to disconnected to avoid noisy unauthorized loops.
      if ((err as Error | undefined)?.message === "socket_auth_missing") {
        shouldReconnect = false;
        updateStatus("disconnected");
        return;
      }
      scheduleReconnect();
    }
  }

  function resetState(): void {
    connecting = false;
    reconnectAttempt = 0;
    identity = null;
    identityKey = null;
    shouldReconnect = false;
    clearHeartbeat();
    detachOnlineListener();
    if (reconnectTimer) {
      clearTimeout(reconnectTimer);
      reconnectTimer = null;
    }
    outboundQueue.length = 0;
  }

  function disconnect(): void {
    shouldReconnect = false;
    const instance = socket;
    resetState();
    if (instance) {
      try {
        instance.disconnect();
        instance.removeAllListeners();
      } catch {
        // ignore disconnect errors
      }
    }
    socket = null;
  }

  function connect(nextIdentity: Identity): Socket | null {
    // Require a valid identity to avoid unauthorized connections.
    if (!nextIdentity) {
      return null;
    }
    const instance = ensureSocket();
    if (!instance) {
      return null;
    }
    const changed = hasIdentityChanged(nextIdentity);
    identity = nextIdentity;
    shouldReconnect = true;
    if (changed && instance.connected) {
      instance.disconnect();
    }
    if (!instance.connected) {
      void startConnection(changed);
    }
    return instance;
  }

  function onStatus(listener: (next: SocketConnectionStatus) => void): () => void {
    statusListeners.add(listener);
    return () => {
      statusListeners.delete(listener);
    };
  }

  function getStatus(): SocketConnectionStatus {
    return status;
  }

  function getSocketInstance(): Socket | null {
    return socket;
  }

  return {
    connect,
    disconnect,
    onStatus,
    getStatus,
    getSocket: getSocketInstance,
  } satisfies SocketManager<Identity>;
}
