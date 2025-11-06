import { describe, expect, it } from "vitest";

import { resolveProfileContext } from "@/app/(identity)/settings/profile/profile-support";
import type { AuthUser } from "@/lib/auth-storage";
import { getDemoCampusId, getDemoUserId } from "@/lib/env";

describe("resolveProfileContext", () => {
  it("returns live context when auth user is present", () => {
    const authUser: AuthUser = {
      userId: "u-live",
      campusId: "c-live",
      handle: "live_handle",
      displayName: "Live User",
    };

    const context = resolveProfileContext(authUser);

    expect(context).toEqual({ userId: "u-live", campusId: "c-live", mode: "live" });
  });

  it("falls back to null campus when not provided", () => {
    const authUser: AuthUser = {
      userId: "u-no-campus",
      campusId: null,
    };

    const context = resolveProfileContext(authUser);

    expect(context.mode).toBe("live");
    expect(context.campusId).toBeNull();
    expect(context.userId).toBe("u-no-campus");
  });

  it("returns demo context when auth user is missing", () => {
    const context = resolveProfileContext(null);

    expect(context.mode).toBe("demo");
    expect(context.userId).toBe(getDemoUserId());
    expect(context.campusId).toBe(getDemoCampusId());
  });
});
