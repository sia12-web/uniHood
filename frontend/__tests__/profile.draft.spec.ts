import { beforeEach, describe, expect, it } from "vitest";

import {
  createOfflineProfile,
  loadDraftFromStorage,
  storeDraftProfile,
  DRAFT_STORAGE_KEY,
} from "@/app/(identity)/settings/profile/profile-support";

describe("profile draft persistence", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it("persists avatar data when saving a draft profile", () => {
    const base = createOfflineProfile("user-1", "campus-1");
    const withAvatar = {
      ...base,
      avatar_url: "data:image/png;base64,r0=",
      avatar_key: "local-123",
    };

    storeDraftProfile(withAvatar);

    const stored = window.localStorage.getItem(DRAFT_STORAGE_KEY);
    expect(stored).toBeTruthy();
    const parsed = stored ? JSON.parse(stored) : {};
    expect(parsed.avatar_url).toBe("data:image/png;base64,r0=");
    expect(parsed.avatar_key).toBe("local-123");

    const loaded = loadDraftFromStorage("user-1", "campus-1");
    expect(loaded?.avatar_url).toBe("data:image/png;base64,r0=");
    expect(loaded?.avatar_key).toBe("local-123");
  });

  it("normalises drafts missing avatar fields", () => {
    const legacy = createOfflineProfile("legacy-user", "campus-2");
    const { avatar_url: _omitUrl, avatar_key: _omitKey, ...rest } = legacy;

    window.localStorage.setItem(DRAFT_STORAGE_KEY, JSON.stringify(rest));

    const loaded = loadDraftFromStorage("legacy-user", "campus-2");
    expect(loaded).not.toBeNull();
    expect(loaded?.avatar_url).toBeNull();
    expect(loaded?.avatar_key).toBeNull();
  });
});
