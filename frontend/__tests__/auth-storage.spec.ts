import { describe, expect, it } from "vitest";

import { Buffer } from "node:buffer";

import { resolveAuthHeaders, isSyntheticAccessToken, type AuthSnapshot } from "@/lib/auth-storage";

function makeJwt(claims: Record<string, unknown>): string {
	const header = Buffer.from(JSON.stringify({ alg: "HS256", typ: "JWT" })).toString("base64url");
	const payload = Buffer.from(JSON.stringify(claims)).toString("base64url");
	return `${header}.${payload}.signature`;
}

describe("resolveAuthHeaders", () => {
	it("returns dev headers without bearer for synthetic tokens", () => {
		const snapshot: AuthSnapshot = {
			access_token: "token;uid:user-123;campus:campus-456;sid:session-789;handle:demo",
		};
		const headers = resolveAuthHeaders(snapshot);
		expect(headers).not.toHaveProperty("Authorization");
		expect(headers["X-User-Id"]).toBe("user-123");
		expect(headers["X-Campus-Id"]).toBe("campus-456");
		expect(headers["X-Session-Id"]).toBe("session-789");
		expect(headers["X-User-Handle"]).toBe("demo");
	});

	it("includes bearer auth for JWT tokens", () => {
		const token = makeJwt({
			sub: "user-123",
			campus_id: "campus-789",
			handle: "demo-user",
			name: "Demo User",
		});
		const snapshot: AuthSnapshot = {
			access_token: token,
			user_id: "legacy-will-be-overridden",
		};
		const headers = resolveAuthHeaders(snapshot);
		expect(headers.Authorization).toBe(`Bearer ${token}`);
		expect(headers["X-User-Id"]).toBe("user-123");
		expect(headers["X-Campus-Id"]).toBe("campus-789");
		expect(headers["X-User-Handle"]).toBe("demo-user");
		expect(headers["X-User-Name"]).toBe("Demo User");
	});
});

describe("isSyntheticAccessToken", () => {
	it("detects synthetic dev tokens", () => {
		expect(isSyntheticAccessToken("token;uid:user")).toBe(true);
		expect(isSyntheticAccessToken("header.payload.signature")).toBe(false);
	});
});
