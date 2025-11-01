import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { listGroups } from "@/lib/communities";

describe("communities client", () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    vi.resetAllMocks();
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it("fetches group listings", async () => {
    const groups = [
      {
        id: "g1",
        name: "Makers",
        slug: "makers",
        description: "Rapid prototypes",
        visibility: "public",
        tags: ["hardware"],
        campus_id: null,
        avatar_key: null,
        cover_key: null,
        is_locked: false,
        created_by: "u1",
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        role: null,
      },
    ];

    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ items: groups }),
    } as Response);

    const result = await listGroups({ limit: 5, offset: 10 });

    expect(global.fetch).toHaveBeenCalledWith(
      "/api/communities/v1/groups?limit=5&offset=10",
      expect.objectContaining({ method: "GET" })
    );
    expect(result).toEqual(groups);
  });
});
