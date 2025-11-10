import { afterEach, describe, expect, it, vi } from "vitest";

import {
	commitAvatar,
	listCampuses,
	patchProfile,
	registerIdentity,
	verifyEmailToken,
} from "@/lib/identity";

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

	const jsonHeaders = {
		get(key: string) {
			if (key.toLowerCase() === "content-type") {
				return "application/json";
			}
			return null;
		},
	};

const emptyHeaders = {
	get() {
		return null;
	},
};

afterEach(() => {
	vi.restoreAllMocks();
});

describe("identity api helpers", () => {
	it("fetches campus directory", async () => {
		const fetchMock = vi.fn().mockResolvedValue({
			ok: true,
			status: 200,
			headers: jsonHeaders,
			json: async () => [],
		});
		(globalThis as any).fetch = fetchMock;

		await listCampuses();

		expect(fetchMock).toHaveBeenCalledTimes(1);
		const [url, options] = fetchMock.mock.calls[0];
		expect(url).toBe("http://localhost:8000/auth/campuses");
		expect(options?.method).toBe("GET");
	});

	it("registers new identity via POST", async () => {
		const fetchMock = vi.fn().mockResolvedValue({
			ok: true,
			status: 200,
			headers: jsonHeaders,
			json: async () => ({ user_id: "u-1", email: "demo@example.edu" }),
		});
		(globalThis as any).fetch = fetchMock;

		await registerIdentity({
			email: "demo@example.edu",
			password: "password123",
			handle: "demo",
			display_name: "Demo User",
			campus_id: "c-1",
		});

		const [, options] = fetchMock.mock.calls[0];
		expect(options?.method).toBe("POST");
		const headers = normaliseHeaders(options?.headers);
		expect(headers).toMatchObject({ "content-type": "application/json" });
		expect(options?.body).toContain("demo@example.edu");
	});

	it("sends auth headers for profile patch", async () => {
		const fetchMock = vi.fn().mockResolvedValue({
			ok: true,
			status: 200,
			headers: jsonHeaders,
			json: async () => ({
				id: "u-1",
				email: "demo@example.edu",
				email_verified: true,
				handle: "demo",
				display_name: "Demo",
				bio: "",
				privacy: { visibility: "everyone", ghost_mode: false },
				status: { text: "", emoji: "", updated_at: new Date().toISOString() },
			}),
		});
		(globalThis as any).fetch = fetchMock;

		await patchProfile("u-1", "c-1", { display_name: "Demo" });

		const [, options] = fetchMock.mock.calls[0];
		const headers = normaliseHeaders(options?.headers);
		expect(headers).toMatchObject({ "x-user-id": "u-1", "x-campus-id": "c-1" });
	});

	it("raises error message from backend", async () => {
		const fetchMock = vi.fn().mockResolvedValue({
			ok: false,
			status: 410,
			headers: jsonHeaders,
			json: async () => ({ detail: "token_expired" }),
		});
		(globalThis as any).fetch = fetchMock;

		await expect(verifyEmailToken("bad-token")).rejects.toThrow(/token_expired/);
	});

	it("handles avatar commit returning raw text", async () => {
		const fetchMock = vi.fn().mockResolvedValue({
			ok: true,
			status: 200,
			headers: emptyHeaders,
			text: async () => JSON.stringify({}),
		});
		(globalThis as any).fetch = fetchMock;

		await commitAvatar("u-1", null, "avatars/u-1/demo.png");

		expect(fetchMock).toHaveBeenCalledTimes(1);
		const [url, options] = fetchMock.mock.calls[0];
		expect(url).toBe("http://localhost:8000/profile/avatar/commit");
		expect(options?.method).toBe("POST");
		const headers = normaliseHeaders(options?.headers);
		expect(headers).toMatchObject({ "x-user-id": "u-1" });
	});
});
