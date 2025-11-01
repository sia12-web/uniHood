import type { NearbyDiff, NearbyUser } from "./types";

export function applyDiff(current: NearbyUser[], diff: NearbyDiff, activeRadius: number): NearbyUser[] {
  if (diff.radius_m !== activeRadius) {
    return current;
  }
  const map = new Map(current.map((user) => [user.user_id, user] as const));
  diff.removed.forEach((id) => map.delete(id));
  diff.updated.forEach((user) => map.set(user.user_id, user));
  diff.added.forEach((user) => map.set(user.user_id, user));
  return Array.from(map.values()).sort((a, b) => (a.distance_m ?? Infinity) - (b.distance_m ?? Infinity));
}
