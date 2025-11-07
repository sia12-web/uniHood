import { create } from "zustand";

export type PresenceStatus = {
  online: boolean;
  lastSeen?: string | null;
  updatedAt: number;
};

type PresenceState = {
  users: Record<string, PresenceStatus>;
  setMany(records: Array<{ userId: string; online: boolean; lastSeen?: string | null }>): void;
  setOne(record: { userId: string; online: boolean; lastSeen?: string | null }): void;
  markActive(userId: string, options?: { lastSeen?: string | null; ttlMs?: number }): void;
  clear(): void;
};

const DEFAULT_ACTIVITY_TTL_MS = 60_000;

export const usePresenceStore = create<PresenceState>((set, get) => {
  const activityTimers = new Map<string, number>();

  const cancelAutoOffline = (userId: string) => {
    if (typeof window === "undefined") {
      return;
    }
    const timerId = activityTimers.get(userId);
    if (timerId !== undefined) {
      window.clearTimeout(timerId);
      activityTimers.delete(userId);
    }
  };

  const scheduleAutoOffline = (userId: string, ttlMs: number) => {
    if (typeof window === "undefined") {
      return;
    }
    const existing = activityTimers.get(userId);
    if (existing !== undefined) {
      window.clearTimeout(existing);
    }
    const timeoutId = window.setTimeout(() => {
      const current = get().users[userId];
      if (!current) {
        activityTimers.delete(userId);
        return;
      }
      if (Date.now() - current.updatedAt < ttlMs) {
        // Presence updated after this timer was scheduled; keep current state.
        return;
      }
      set((state) => {
        const snapshot = state.users[userId];
        if (!snapshot) {
          activityTimers.delete(userId);
          return state;
        }
        const next = { ...state.users };
        next[userId] = {
          online: false,
          lastSeen: snapshot.lastSeen ?? new Date().toISOString(),
          updatedAt: Date.now(),
        };
        activityTimers.delete(userId);
        return { users: next };
      });
    }, ttlMs);
    activityTimers.set(userId, timeoutId);
  };

  return {
    users: {},
    setMany: (records) => {
      records.forEach((record) => cancelAutoOffline(record.userId));
      set((state) => {
        const next = { ...state.users };
        const now = Date.now();
        records.forEach((record) => {
          next[record.userId] = {
            online: record.online,
            lastSeen: record.lastSeen ?? null,
            updatedAt: now,
          };
        });
        return { users: next };
      });
    },
    setOne: (record) => {
      cancelAutoOffline(record.userId);
      set((state) => ({
        users: {
          ...state.users,
          [record.userId]: {
            online: record.online,
            lastSeen: record.lastSeen ?? null,
            updatedAt: Date.now(),
          },
        },
      }));
    },
    markActive: (userId, options) => {
      if (!userId) {
        return;
      }
      const lastSeen = options?.lastSeen ?? new Date().toISOString();
      const ttlMs = options?.ttlMs ?? DEFAULT_ACTIVITY_TTL_MS;
      set((state) => ({
        users: {
          ...state.users,
          [userId]: {
            online: true,
            lastSeen,
            updatedAt: Date.now(),
          },
        },
      }));
      scheduleAutoOffline(userId, ttlMs);
    },
    clear: () => {
      if (typeof window !== "undefined") {
        activityTimers.forEach((timerId) => window.clearTimeout(timerId));
      }
      activityTimers.clear();
      set({ users: {} });
    },
  };
});

export function selectPresence(userId: string) {
  return (state: PresenceState) => state.users[userId] ?? null;
}

export function hydratePresence(records: Array<{ user_id: string; online: boolean; last_seen?: string | null }>) {
  usePresenceStore.getState().setMany(
    records.map((record) => ({ userId: record.user_id, online: record.online, lastSeen: record.last_seen ?? null })),
  );
}

export function markPresenceFromActivity(userId: string, options?: { lastSeen?: string | null; ttlMs?: number }) {
  usePresenceStore.getState().markActive(userId, options);
}
