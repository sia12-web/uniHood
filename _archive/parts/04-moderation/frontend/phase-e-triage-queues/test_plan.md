# Moderation · Frontend Phase E — Case Triage & Work Queues UI

## 0) Scope
Queues hub, keyboard triage, SLA indicators, canned actions, claim/lock behavior, conflicts, and RBAC guardrails.

## 1) Unit tests (Vitest + RTL)
- `sla-badge` renders correct color states relative to targets and updates countdown text.
- `queue-table` handles focus, `J/K` navigation, and `Enter` to open the drawer callback.
- `canned-actions` renders macros, disables options when permission is missing, emits selection events.
- `quick-note` posts audit notes via hook and clears input on success.

## 2) Integration tests (MSW)
- Queue pagination via `/admin/cases` with `next` cursor; preset filters mapped to request params.
- Batch actions (`assign`, `dismiss`, `apply_enforcement`) trigger refetch and optimistic updates.
- Lock events disable row actions until unlocked.
- Conflict (409) surfaces toast, refetches, and keeps keyboard position.

## 3) End-to-end (Playwright)
- Moderator triages `/triage/sev4`: assign (`A`), tombstone (`T`), auto-skips to next.
- Drawer SLA timer transitions from green to red when breaching.
- Selecting canned "Spam" macro applies enforcement and shows toast.
- `appeals-pending` queue hides restricted actions for moderators but shows for admin.

## 4) Accessibility (axe)
- Drawer dialog labeled, focus trapped; hotkey help overlay accessible with `?`.
- Keyboard-only navigation covers queue rows and actions.

## 5) Performance
- Virtualized list remains smooth; mocks keep action round-trips <300 ms.
- Drawer opens under 120 ms thanks to lazy data fetching.

## 6) Coverage targets
- ≥85 % line coverage on triage components/hooks.
- ≥80 % integration coverage on queue interactions.
- Playwright smoke for sev4 and appeals queues.
