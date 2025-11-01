# Moderation · Frontend Phase D — Admin Tools & Macros Runner UI · Test Plan

## 0) Scope
Tests cover catalog CRUD, macro simulate/execute flow, batch unshadow/revert, bundle import/export, jobs list/detail, RBAC, accessibility, and safety rails.

## 1) Unit (Jest + RTL)
- `CatalogTable` renders version and kind metadata; deactivate toggles state buttons.
- `CreateActionDialog` validates JSON spec and blocks submit on invalid schema.
- `SelectorBuilder` emits correct DTOs for cases, subjects, and query selectors.
- `MacroForm` requires simulate before execute; sample size validation covered.
- `JobsProgress` computes percentage from succeeded/total and handles unknown totals.

## 2) Integration (MSW)
- **Catalog**
  - `GET /tools/actions` list; `POST /tools/actions` create; `/deactivate` updates item.
- **Macros**
  - Simulate returns plan with steps; execute posts job; Jobs page shows new job row.
- **Unshadow/Revert**
  - Preview request returns sample; execute posts job; progress visible on job page.
- **Bundles**
  - Export triggers file download; import dry-run returns diff; enable executes; duplicates ignored afterward.
- **Jobs**
  - List & details fetch; socket events update progress; NDJSON link visible when provided.
- **RBAC**
  - Moderator access blocked (403 mocked); UI redirects.

## 3) E2E (Playwright)
- Admin opens **Macros** page, simulates on query (shadow_only), executes sample=20, navigates to job details, watches progress to completion.
- Runs **Batch Unshadow** for a campus; confirmation with "RUN" string; job success; posts reappear in sample context.
- Imports bundle YAML (dry-run → enable); catalog shows new versions; deactivates an old action.
- Runs **Batch Revert** for `restrict_create` on 40 users; job shows per-item results.

## 4) Accessibility (axe)
- No critical issues; dialogs labeled; editors have `aria-describedby` with schema help.

## 5) Safety Rails
- Attempting execute without simulate returns 409; UI prompts re-simulate banner.
- Large selector without campus filter shows warning toast and disables execute until acknowledged.

## 6) Performance
- Plan preview of 200 items renders under 120 ms (mocked dataset).
- Jobs table virtualized beyond 1k entries with smooth scroll.

## 7) Coverage Targets
- ≥ 85% components/hooks; ≥ 80% integration; E2E smoke suite passes.
