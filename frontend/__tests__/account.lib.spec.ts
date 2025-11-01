import { afterEach, describe, expect, it, vi } from "vitest";

import {
  listLinkProviders,
  listLinkedAccounts,
  startAccountLink,
  requestEmailChange,
  verifyPhoneCode,
  uploadContactHashes,
} from "@/lib/account";

const jsonHeaders = {
  get(key: string) {
    if (key.toLowerCase() === "content-type") {
      return "application/json";
    }
    return null;
  },
};

afterEach(() => {
  vi.restoreAllMocks();
});

describe("account api helpers", () => {
  it("sends auth headers when listing providers", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      headers: jsonHeaders,
      json: async () => ["google"],
    });
    (globalThis as any).fetch = fetchMock;

    await listLinkProviders("user-1", "campus-1");

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, options] = fetchMock.mock.calls[0];
    expect(url).toBe("http://localhost:8000/account/link/providers");
    expect(options?.headers).toMatchObject({ "X-User-Id": "user-1", "X-Campus-Id": "campus-1" });
  });

  it("fetches linked accounts", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      headers: jsonHeaders,
      json: async () => [{
        id: "id-1",
        provider: "google",
        subject: "sub-123",
        email: "user@example.com",
        created_at: new Date().toISOString(),
      }],
    });
    (globalThis as any).fetch = fetchMock;

    const accounts = await listLinkedAccounts("user-1", null);

    expect(Array.isArray(accounts)).toBe(true);
    const [, options] = fetchMock.mock.calls[0];
    expect(options?.headers).toMatchObject({ "X-User-Id": "user-1" });
  });

  it("starts account linking with provider query", async () => {
    const startResponse = {
      authorizeUrl: "https://oauth.example/authorize",
      state: "state-123",
      codeVerifier: "v",
      codeChallenge: "c",
    };
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      headers: jsonHeaders,
      json: async () => startResponse,
    });
    (globalThis as any).fetch = fetchMock;

    const response = await startAccountLink("user-1", null, "google");

    expect(response.authorizeUrl).toContain("oauth.example");
    const [url] = fetchMock.mock.calls[0];
    expect(url).toBe("http://localhost:8000/account/link/start?provider=google");
  });

  it("requests email change via POST", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      headers: jsonHeaders,
      json: async () => ({ status: "requested", token: "token-123" }),
    });
    (globalThis as any).fetch = fetchMock;

    const response = await requestEmailChange("user-1", null, "new@example.com");

    expect(response.token).toBe("token-123");
    const [, options] = fetchMock.mock.calls[0];
    expect(options?.method).toBe("POST");
    expect(options?.body).toContain("new@example.com");
  });

  it("verifies phone code", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      headers: jsonHeaders,
      json: async () => ({ e164: "+15555550123", verified: true, verified_at: new Date().toISOString() }),
    });
    (globalThis as any).fetch = fetchMock;

    const result = await verifyPhoneCode("user-1", null, "123456");

    expect(result.verified).toBe(true);
    const [, options] = fetchMock.mock.calls[0];
    expect(options?.body).toContain("123456");
  });

  it("uploads contact hashes", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      headers: jsonHeaders,
      json: async () => ({ status: "ok", count: 2 }),
    });
    (globalThis as any).fetch = fetchMock;

    await uploadContactHashes("user-1", "campus-1", ["email:abcd", "phone:efgh"]);

    const [, options] = fetchMock.mock.calls[0];
    expect(options?.body).toContain("email:abcd");
  });

  it("throws detailed error when backend returns message", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      status: 400,
      headers: jsonHeaders,
      json: async () => ({ detail: "contact_optout" }),
    });
    (globalThis as any).fetch = fetchMock;

    await expect(uploadContactHashes("user-1", null, ["email:abcd"])).rejects.toThrow(/contact_optout/);
  });
});
