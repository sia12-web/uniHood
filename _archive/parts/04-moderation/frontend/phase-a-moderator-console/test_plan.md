# Moderation · Frontend Phase A — Moderator Console UI · Test Plan

## 0) Scope
Covers cases list/detail, quarantine decisions, macro simulate/execute wiring, jobs monitor, RBAC guard, a11y, and performance basics.

## 1) Unit (Jest + RTL)
- **CasesFilters**: building query params; emits changes debounced; resets work.
- **CasesTableVirtual**: renders rows; selection works; action menu triggers callbacks.
- **CaseActionsBar**: buttons enabled/disabled based on role & case status.
- **QuarantineCard**: reveal toggles; decision buttons call mutation.
- **MacroRunnerForm**: validates inputs; blocks execute until simulate run.
- **JobsProgress**: shows progress bar; computes percentages.

## 2) Integration (MSW)
- **Cases list**: `/admin/cases` returns items+next; infinite scroll appends; filters adjust query; “assign to me” batch call payload validated.
- **Case detail**: `/admin/cases/{id}` + `/admin/audit` render tabs; quick action `escalate` posts and refetches.
- **Quarantine**: list loads; decision POST updates and refetches; batch selection applies single call per verdict.
- **Macro**: simulate → renders plan; execute → enqueues job; `/jobs` shows new job.
- **Jobs**: list `/tools/jobs` fetched; socket `job.updated` updates progress live.

## 3) E2E (Playwright)
- Moderator logs in → `/admin/mod/cases` loads; filters to `open` & `severity≥3`; selects 5 rows; runs “Assign to me”; rows show assigned.
- Open a case → view Timeline; apply “tombstone” → status updates; audit tab reflects.
- Quarantine → mark 3 as **Clean**, 1 as **Blocked**; items disappear; subject pages reflect changes.
- Tools → simulate macro on query; execute sample=10; Jobs shows progress to completion.

## 4) Accessibility (axe)
- No critical violations on Cases/Quarantine/Jobs pages.
- Buttons/menus have names; tables have headers associations.
- Keyboard navigation works for list selection and action menus.

## 5) Security
- Guard redirects non-staff to login; moderator cannot access admin-only controls (appeal resolve, reveal PII).
- CSRF intent header present on POSTs.

## 6) Performance
- Cases first page render < 150 ms (mocked).
- Virtualization keeps >55 FPS with 1k rows.

## 7) Fixtures / Mocks
- MSW:
  - `GET /api/mod/v1/admin/cases`
  - `GET /api/mod/v1/admin/cases/:id`
  - `POST /api/mod/v1/admin/cases/batch_action`
  - `GET /api/mod/v1/quarantine`
  - `POST /api/mod/v1/quarantine/:id/decision`
  - `POST /api/mod/v1/admin/tools/simulate/macro`
  - `POST /api/mod/v1/admin/tools/run/macro`
  - `GET /api/mod/v1/admin/tools/jobs`
  - `GET /api/mod/v1/admin/audit`
  - `GET /api/mod/v1/reputation/:userId`
  - `GET /api/mod/v1/restrictions`
- Socket mock for `/staff`: `job.updated`, `job.completed`.

## 8) Coverage Targets
- ≥ 85% components/hooks; ≥ 80% integration; green E2E smoke.
