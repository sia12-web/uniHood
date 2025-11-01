import { describe, expect, it } from "vitest";

import {
  buildUrlParams,
  canRunSearch,
  normalizeSearchParams,
  sanitizeHighlight,
  type NormalizedSearchParams,
} from "@/utils/search";

describe("search utils", () => {
  it("normalizes params with defaults", () => {
    const params = normalizeSearchParams({ q: "  hello  ", campus_id: "abc", tags: ["eng"] });
    expect(params).toEqual({
      q: "hello",
      campus_id: "abc",
      tags: ["eng"],
      time_from: undefined,
      time_to: undefined,
      size: 20,
    });
  });

  it("builds url params with overrides", () => {
    const base: NormalizedSearchParams = {
      q: "hello",
      campus_id: "campus-1",
      tags: ["eng", "robotics"],
      time_from: "2024-01-01T00:00:00.000Z",
      time_to: undefined,
      size: 10,
    };
    const result = buildUrlParams(base, { q: "world", tags: ["stem"] });
    const search = new URLSearchParams(result);
    expect(search.get("q")).toBe("world");
    expect(search.get("campus")).toBe("campus-1");
    expect(search.getAll("tags")).toStrictEqual(["stem"]);
    expect(search.get("size")).toBe("10");
  });

  it("sanitizes highlight markup", () => {
    const highlighted = sanitizeHighlight('<strong><em class="hit">match</em></strong> & <script>alert(1)</script>');
    expect(highlighted).toBe("<em>match</em> & ");
  });

  it("decides if search can run", () => {
    const base: NormalizedSearchParams = {
      q: "",
      campus_id: undefined,
      tags: [],
      time_from: undefined,
      time_to: undefined,
      size: 20,
    };
    expect(canRunSearch("groups", base)).toBe(false);
    expect(canRunSearch("groups", { ...base, q: "ai" })).toBe(true);
    expect(canRunSearch("posts", { ...base, tags: ["stem"] })).toBe(true);
    expect(canRunSearch("events", { ...base, campus_id: "campus" })).toBe(true);
  });
});
