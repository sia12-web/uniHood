import "@testing-library/jest-dom/vitest";
import { describe, expect, it, beforeEach, vi } from "vitest";

import {
  createFallbackPosition,
  getLastHeartbeatAt,
  isRecentlyLive,
  sendHeartbeat,
} from "@/lib/presence/api";

// Helper to clear localStorage between tests
function clearLastHeartbeat() {
  try {
    window.localStorage.removeItem("divan:lastHeartbeatAt");
  } catch {}
}

describe("presence api", () => {
  beforeEach(() => {
    clearLastHeartbeat();
    vi.restoreAllMocks();
  });

  it("isRecentlyLive returns false when no heartbeat is recorded", () => {
    expect(getLastHeartbeatAt()).toBeNull();
    expect(isRecentlyLive()).toBe(false);
  });

  it("isRecentlyLive respects windowMs threshold", () => {
    const now = Date.now();
    // Older than 90s default
    window.localStorage.setItem("divan:lastHeartbeatAt", String(now - 120_000));
    expect(isRecentlyLive()).toBe(false);
    // Within 90s
    window.localStorage.setItem("divan:lastHeartbeatAt", String(now - 30_000));
    expect(isRecentlyLive()).toBe(true);
    // Tight window provided
    expect(isRecentlyLive(10_000)).toBe(false);
  });

  it("sendHeartbeat records lastHeartbeatAt on success", async () => {
    const position = createFallbackPosition();
    // Mock fetch OK
    const mockFetch = vi.spyOn(global, "fetch" as any).mockResolvedValue({ ok: true } as Response);

    await sendHeartbeat(position, "user-x", "campus-y", 50);

    expect(mockFetch).toHaveBeenCalled();
    const ts = getLastHeartbeatAt();
    expect(typeof ts).toBe("number");
    expect(isRecentlyLive()).toBe(true);
  });
});
