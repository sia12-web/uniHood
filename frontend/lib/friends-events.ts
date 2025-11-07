export const FRIENDSHIP_FORMED_EVENT = "divan:friendship:formed" as const;

export type FriendshipFormedDetail = {
  peerId?: string;
};

type FriendshipEvent = CustomEvent<FriendshipFormedDetail>;

export function emitFriendshipFormed(peerId?: string): void {
  if (typeof window === "undefined") {
    return;
  }
  const detail: FriendshipFormedDetail = peerId ? { peerId } : {};
  const event: FriendshipEvent = new CustomEvent(FRIENDSHIP_FORMED_EVENT, { detail });
  window.dispatchEvent(event);
}
