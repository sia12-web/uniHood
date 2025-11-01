import { test, expect } from "@playwright/test";

test.describe("communities hub", () => {
  test("renders group cards when API responds", async ({ page }) => {
    await page.route("**/api/me", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          id: "staff-1",
          email: "staff@example.com",
          display_name: "Staffer",
          roles: ["moderator"],
        }),
      });
    });
    await page.route("**/api/communities/v1/groups?*", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          items: [
            {
              id: "c1",
              name: "Campus Creators",
              slug: "campus-creators",
              description: "Ship rapid prototypes with fellow makers.",
              visibility: "public",
              tags: ["makers", "design"],
              campus_id: null,
              avatar_key: null,
              cover_key: null,
              is_locked: false,
              created_by: "u-1",
              created_at: new Date().toISOString(),
              updated_at: new Date().toISOString(),
              role: null,
            },
          ],
        }),
      });
    });

    await page.goto("/communities", { waitUntil: "domcontentloaded" });

    await expect(page.getByRole("heading", { name: "Discover and grow your campus circles" })).toBeVisible();
    await expect(page.getByText("Campus Creators")).toBeVisible();
    await expect(page.getByRole("link", { name: /Explore/ }).first()).toBeVisible();
  });
});
