
import { vi, describe, beforeEach, test, expect } from "vitest";
import { adminAnalytics } from "@/lib/admin-analytics";
import { getBackendUrl } from "@/lib/env";
import { readAuthSnapshot, resolveAuthHeaders } from "@/lib/auth-storage";

// Mock dependencies
vi.mock("@/lib/env", () => ({
    getBackendUrl: vi.fn(() => "http://test-api"),
}));

vi.mock("@/lib/auth-storage", () => ({
    readAuthSnapshot: vi.fn(),
    resolveAuthHeaders: vi.fn(() => ({ "X-Test": "1" })),
}));

// Mock fetch
global.fetch = vi.fn();

describe("Admin Analytics Client", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        (readAuthSnapshot as any).mockReturnValue({});
    });

    test("getOverview calls correct endpoint", async () => {
        (global.fetch as any).mockResolvedValueOnce({
            ok: true,
            json: async () => ({ total_meetups_created: 10 }),
        });

        const res = await adminAnalytics.getOverview();
        expect(res.total_meetups_created).toBe(10);
        expect(fetch).toHaveBeenCalledWith("http://test-api/admin/analytics/overview", expect.objectContaining({
            headers: expect.objectContaining({ "X-Test": "1" }),
        }));
    });

    test("getPopularGames passes limit", async () => {
        (global.fetch as any).mockResolvedValueOnce({
            ok: true,
            json: async () => [],
        });

        await adminAnalytics.getPopularGames(10);
        expect(fetch).toHaveBeenCalledWith("http://test-api/admin/analytics/games/popular?limit=10", expect.any(Object));
    });

    test("handles API error", async () => {
        (global.fetch as any).mockResolvedValueOnce({
            ok: false,
            statusText: "Forbidden",
        });

        await expect(adminAnalytics.getOverview()).rejects.toThrow("Admin API Error: Forbidden");
    });
});
