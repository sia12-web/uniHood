import { expect, test, type Page } from "@playwright/test";

type JsonRecord = Record<string, unknown>;

type AuditResponse = {
  items: Array<{
    id: string;
    created_at: string;
    actor_id: string | null;
    action: string;
    target_type: string;
    target_id: string | null;
    meta: JsonRecord;
  }>;
  next: string | null;
  total?: number | null;
  estimated_total?: number | null;
  events_per_minute?: number | null;
};

const staffProfile = {
  id: "staff-1",
  display_name: "Alex Moderator",
  email: "alex@example.com",
  avatar_url: null,
  scopes: ["staff.moderator"],
  campuses: ["global"],
  default_campus: "global",
};

async function stubStaffIdentity(page: Page) {
  await page.route("**/api/mod/v1/me", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(staffProfile),
    });
  });
}

test.describe("moderation audit explorer", () => {
  test("renders audit events and toggles diff", async ({ page }) => {
    await stubStaffIdentity(page);

    const auditResponse: AuditResponse = {
      items: [
        {
          id: "audit-1",
          created_at: new Date("2025-05-01T12:00:00Z").toISOString(),
          actor_id: "staff-1",
          action: "policy.case.update",
          target_type: "case",
          target_id: "case-42",
          meta: {
            before: { status: "open", severity: 3 },
            after: { status: "closed", severity: 3 },
            diff: [
              { op: "replace", path: "/status", value: "closed" },
            ],
          },
        },
        {
          id: "audit-2",
          created_at: new Date("2025-05-01T11:58:00Z").toISOString(),
          actor_id: "staff-2",
          action: "case.comment.create",
          target_type: "case",
          target_id: "case-99",
          meta: {
            message: "Added moderator note",
          },
        },
      ],
      next: null,
      total: 2,
      events_per_minute: 12,
    };

    await page.route("**/api/mod/v1/admin/audit**", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(auditResponse),
      });
    });

    await page.goto("/admin/mod/audit", { waitUntil: "networkidle" });

    await expect(page.getByRole("heading", { name: "Filters" })).toBeVisible();
    await expect(page.getByText("policy.case.update")).toBeVisible();
    await expect(page.getByText("case.comment.create")).toBeVisible();

    await page.getByRole("button", { name: "Expand" }).first().click();

    await expect(page.getByText("JSON Patch")).toBeVisible();
    await expect(page.getByText("/status")).toBeVisible();
    await expect(page.getByRole("button", { name: "Collapse" })).toBeVisible();
  });
});

test.describe("case timeline", () => {
  test("groups audit events by day and shows metadata", async ({ page }) => {
    await stubStaffIdentity(page);

    const caseId = "case-123";

    await page.route(`**/api/mod/v1/admin/cases/${caseId}`, async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          id: caseId,
          severity: 4,
          status: "open",
          subject_type: "user",
          subject_id: "user-77",
          reason: "policy_violation",
          assigned_to: "staff-1",
          assigned_to_name: "Alex Moderator",
          created_at: new Date("2025-05-01T10:00:00Z").toISOString(),
          updated_at: new Date("2025-05-01T11:59:00Z").toISOString(),
          campus_id: "global",
          appeal_open: false,
        }),
      });
    });

    await page.route("**/api/mod/v1/admin/audit**", async (route) => {
      const timelineResponse: AuditResponse = {
        items: [
          {
            id: "timeline-1",
            created_at: "2025-05-02T09:15:00Z",
            actor_id: "staff-1",
            action: "case.report.received",
            target_type: "case",
            target_id: caseId,
            meta: {
              before: { report_count: 0 },
              after: { report_count: 1 },
              diff: [
                { op: "replace", path: "/report_count", value: 1 },
              ],
            },
          },
          {
            id: "timeline-2",
            created_at: "2025-05-02T10:45:00Z",
            actor_id: "staff-2",
            action: "action.apply.warning",
            target_type: "case",
            target_id: caseId,
            meta: {
              before: { status: "open" },
              after: { status: "under_review" },
              diff: [
                { op: "replace", path: "/status", value: "under_review" },
              ],
            },
          },
        ],
        next: null,
        total: 2,
      };

      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(timelineResponse),
      });
    });

    await page.goto(`/admin/mod/cases/${caseId}/timeline`, { waitUntil: "networkidle" });

    await expect(page.getByRole("heading", { name: `Case ${caseId} timeline` })).toBeVisible();
    await expect(page.getByText("Status: open")).toBeVisible();

    await expect(page.getByText("case.report.received")).toBeVisible();
    await expect(page.getByText("action.apply.warning")).toBeVisible();

    await expect(page.getByText("JSON Patch")).toBeVisible();
    await expect(page.getByRole("button", { name: "Collapse" })).toBeVisible();
  });
});
