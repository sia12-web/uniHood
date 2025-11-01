# Phase C Frontend Test Plan — Reputation, Restrictions, Linkage & Appeals

## 0) Scope
Covers new moderator console flows for user reputation inspection, restriction management, linkage graph, and appeal resolution. Includes UI smoke, permissions, telemetry hooks, and integration verifications against mocked API responses.

## 1) Manual Smoke Checklist
1. Staff moderator navigates to `/admin/mod/users/<userId>`.
   - Reputation header renders (avatar, risk band, score card).
   - Events table paginates when >25 rows.
   - Restrictions panel shows active count; read-only for moderator (no adjust score button).
2. Staff admin signs in.
   - Adjust score button visible; dry-run change updates preview band.
   - Applying +5 adjustment triggers success toast and refetch.
3. Create restriction (preset dropdown → comment cooldown 15m).
   - Dialog pre-fills TTL; submit shows toast; list refreshes.
4. Revoke restriction.
   - Confirmation triggered; success toast; restriction removed.
5. Linkage tab `/admin/mod/users/<userId>/linkage`.
   - Graph loads; filters reduce nodes.
   - Keyboard fallback table accessible via "List View" toggle; can open user profile.
   - Macro dropdown hidden unless admin role.
6. Case appeal tab `/admin/mod/cases/<caseId>/appeal` (admin).
   - Shows appeal note/status.
   - Accept path: open dialog, displays revertors checklist, confirm → status badge updates.
   - Reject path similar with reason optional.
7. Telemetry: verify network POST `ops/ui` with metrics `ui_rep_*`, `ui_linkage_open_total`, `ui_appeal_resolve_total` after respective actions (using devtools or mocked spy).

## 2) Automated Testing

### 2.1 Unit
- Hooks:
  - `useReputation` fetches + caches.
  - `useRestrictions` handles `activeOnly` flag.
  - `useRestrictionMutations` invalidates queries upon success.
  - `useLinkage` respects filters.
  - `useResolveAppeal` invalidates case queries and handles error.
- Components:
  - `ScoreCard` renders band color mapping.
  - `RestrictionsPanel` hides admin actions for moderators.
  - `NewRestrictionDialog` validates TTL + reason required.
  - `AppealResolveDialog` disables submit until status selected.

### 2.2 Integration (React Testing Library)
- `/admin/mod/users/[userId]` page with mocked API client.
  - Moderator role: adjusting score button absent; new restriction button disabled or hidden.
  - Admin role: can submit adjust score; ensures telemetry emitter called.
- Linkage page: ensures graph component receives data; list fallback toggled.
- Appeals tab: resolves appeal updates status banner; ensures telemetry emitter invoked with `{status}` label.

### 2.3 Playwright (if time-boxed)
- Scenario: Admin adjusts reputation + applies restriction + resolves appeal (full flow) using API mocks.
- Accessibility snapshot using `axe` plugin for major panels.

## 3) Edge / Regression Cases
- API error surfaces: 500 for adjust score → inline error + toast; no stale data.
- Already resolved appeal -> disabled buttons with info alert.
- Linkage returns >150 nodes -> list fallback triggered automatically.
- Restrictions panel showing empty state when none active; expired toggle reveals history.
- Telemetry endpoint unavailable -> warnings logged once, UI still functional.

## 4) Data / Fixtures
- Mock server responses in tests under `frontend/__tests__/fixtures/mod/`:
  - `reputation.json` with events array.
  - `restrictions-active.json`, `restrictions-historical.json`.
  - `linkage-basic.json` (<=20 nodes) and `linkage-large.json` (>200 for fallback).
  - `appeal-pending.json`, `appeal-resolved.json`.

## 5) Sign-off Criteria
- All unit + integration tests passing.
- Manual checklist completed on dev server using sample accounts (`staff_mod`, `staff_admin`).
- Telemetry verified (network spy or backend counter increment on dev).
- `parts/04-moderation/frontend/phase-c-reputation-restrictions-appeals/summary.md` updated with completed steps.
