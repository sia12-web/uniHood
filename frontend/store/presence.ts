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
  clear(): void;
};

export const usePresenceStore = create<PresenceState>((set) => ({
  users: {},
  setMany: (records) => {
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
  clear: () => set({ users: {} }),
}));

export function selectPresence(userId: string) {
  return (state: PresenceState) => state.users[userId] ?? null;
}

export function hydratePresence(records: Array<{ user_id: string; online: boolean; last_seen?: string | null }>) {
  usePresenceStore.getState().setMany(
    records.map((record) => ({ userId: record.user_id, online: record.online, lastSeen: record.last_seen ?? null })),
  );
}
