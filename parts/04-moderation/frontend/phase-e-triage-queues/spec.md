# Moderation · Frontend Phase E — Case Triage & Work Queues UI

## 0) Goals / Non-Goals
- **Goals:** high-throughput moderator triage, smart queues, per-case claim/lock with conflict handling, SLA indicators, keyboard-first flows, canned actions, quick notes.
- **Non-Goals:** analytics dashboards (covered elsewhere), policy editing or macro management (handled in Phase D).

## 1) Routes
- `/admin/mod/triage` → queue hub (all queues).
- `/admin/mod/triage/[queueKey]` → focused queue (e.g., `sev4`, `appeals-pending`, `quarantine-handoff`).

## 2) Queue definitions
- `sev4`: `severity>=4`, `status=open`.
- `new-24h`: `created_from=now-24h`.
- `appeals-pending`: `appeal_open=true`, `status ∈ {actioned,dismissed}`.
- `unassigned`: `assigned_to=null`, `status=open`.
- `my-claimed`: `assigned_to=me`, `status=open`.
- `escalated`: `escalation_level>0`, `status=open`.
- `quarantine-handoff`: items referencing quarantined attachments.
- Custom queues (query params persisted to local storage) are supported client side.

## 3) Claim / lock semantics
- Claim posts `/admin/cases/batch_action` with `{ action:'assign', case_ids:[id], payload:{ moderator_id: me } }`.
- Optional soft lock: `PATCH /admin/cases/{id}/lock` or socket heartbeat (`case.locked`, `case.unlocked`).
- UI surfaces locking pill and a conflict banner plus unlock affordance (admin only).

## 4) SLA & timers
- SLA per severity from `/admin/dashboard/kpis`; fallback static map.
- Row badge color states: green (<50%), amber (50–100%), red (>100%).
- Drawer shows detailed countdown, updates every second.

## 5) Keyboard triage
- Shortcuts: `J/K` navigation, `Enter` open drawer, `A` assign to me, `E` escalate, `D` dismiss, `T` tombstone, `R` remove, `M` macro picker, `N` note, `S` toggle skip, `?` keyboard help.
- Respect RBAC (hide or disable unsupported actions for moderators).

## 6) UI structure
- **Queue hub:** sidebar of queues with counts/SLA; main virtualized table for current selection.
- **Case drawer:** meta header (claim/lock, SLA timer), tabs (Subject, Signals, Timeline, Actions), canned action buttons, quick note input.
- Conflicts produce toast and refetch row/drawer data.

## 7) Data & hooks
- `useQueue(query)` → infinite query for `/admin/cases` with cursor.
- `useCannedActions()` → fetch macros tagged `triage`.
- `useCaseActions(caseId)` → batch actions (assign, escalate, dismiss, apply enforcement).
- `useClaimLock(caseId)` → optional lock/unlock flow via HTTP/socket.
- `useSla()` → fetch SLA targets and compute status helpers.
- Socket events handled for live lock + updates.

## 8) Config & persistence
- Persist last queue and “skip after action” flag in local storage.
- Cache canned actions and SLA targets for 60 seconds.

## 9) Accessibility
- Table uses semantic roles, focusable rows, hotkeys mirrored by buttons.
- Drawer is an accessible dialog with focus trap.

## 10) Error handling
- Network errors show inline banners with retry.
- 403 triggers RBAC hints.
- 409 conflicts prompt refresh and keep navigation index.

## 11) Telemetry
- Emit `ui_triage_action_total{action}`, `ui_triage_keyboard_used_total`, `ui_triage_claim_total`, `ui_triage_conflict_total`, and queue load metrics.

## 12) Performance
- Table virtualized, drawer tabs lazy-load heavy data, minimize refetch.

## 13) Directory layout
```
/app/(staff)/admin/mod/triage/page.tsx
/app/(staff)/admin/mod/triage/[queueKey]/page.tsx
/components/mod/triage/
  queues-sidebar.tsx
  queue-table.tsx
  row.tsx
  sla-badge.tsx
  case-drawer.tsx
  canned-actions.tsx
  quick-note.tsx
  keyboard-help.tsx
/hooks/mod/triage/
  use-queue.ts
  use-canned.ts
  use-case-actions.ts
  use-claim-lock.ts
  use-sla.ts
```
