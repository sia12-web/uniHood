import { afterEach, describe, expect, it, vi } from "vitest";

import { discoverRooms, searchUsers } from "@/lib/search";

const mockResponse = { items: [], cursor: null };

function normaliseHeaders(input: unknown): Record<string, string> {
	if (!input) {
		return {};
	}
	if (typeof input === "object" && input !== null && typeof (input as Headers).entries === "function") {
		return Object.fromEntries(Array.from((input as Headers).entries()).map(([key, value]) => [key.toLowerCase(), value]));
	}
	if (typeof input === "object" && input !== null) {
		return Object.fromEntries(Object.entries(input as Record<string, string>).map(([key, value]) => [key.toLowerCase(), value]));
	}
	return {};
}

afterEach(() => {
	vi.restoreAllMocks();
});

describe("search api helpers", () => {
	it("calls user search endpoint with headers", async () => {
		const fetchMock = vi.fn().mockResolvedValue({
			ok: true,
			status: 200,
			json: async () => mockResponse,
		});
		(globalThis as any).fetch = fetchMock;

		await searchUsers({ query: "alice", cursor: "abc", limit: 10, userId: "u1", campusId: "c1" });

		expect(fetchMock).toHaveBeenCalledTimes(1);
		const [url, options] = fetchMock.mock.calls[0];
		expect(url).toBe("http://localhost:8000/search/users?q=alice&limit=10&cursor=abc&campus_id=c1");
		const headers = normaliseHeaders(options?.headers);
		expect(headers).toMatchObject({ "x-user-id": "u1", "x-campus-id": "c1" });
	});

	it("uses defaults for room discovery", async () => {
		const fetchMock = vi.fn().mockResolvedValue({
			ok: true,
			status: 200,
			json: async () => mockResponse,
		});
		(globalThis as any).fetch = fetchMock;

		await discoverRooms();

		expect(fetchMock).toHaveBeenCalledTimes(1);
		const [url, options] = fetchMock.mock.calls[0];
		expect(url).toContain("/discover/rooms?");
		const headers = normaliseHeaders(options?.headers);
		expect(headers).toHaveProperty("x-user-id");
		expect(headers).toHaveProperty("x-campus-id");
	});
});
