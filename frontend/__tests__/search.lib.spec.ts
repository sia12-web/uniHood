import { afterEach, describe, expect, it, vi } from "vitest";

import { discoverRooms, searchUsers } from "@/lib/search";

const mockResponse = { items: [], cursor: null };

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
		expect(options?.headers).toMatchObject({ "X-User-Id": "u1", "X-Campus-Id": "c1" });
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
		expect(options?.headers).toHaveProperty("X-User-Id");
		expect(options?.headers).toHaveProperty("X-Campus-Id");
	});
});
