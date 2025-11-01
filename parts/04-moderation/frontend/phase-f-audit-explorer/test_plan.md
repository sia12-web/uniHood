# Moderation · Frontend Phase F — Audit Explorer & Timeline Diff UI

## 0) Scope
Tests audit search, pagination, diff rendering, exports, saved searches, a11y, and performance basics.

## 1) Unit (Jest + RTL)
- **explorer-filters**: builds query params; date range validation; multi-select actions.
- **meta-pretty**: collapses long JSON; copy buttons work.
- **diff-view**: renders before/after object diffs and JSON Patch; handles added/removed/changed.
- **saved-searches**: save/load/delete; persists to localStorage.
- **export-bar**: emits CSV/NDJSON download; disables when no results.

## 2) Integration (MSW)
- **List**:
  - `GET /admin/audit` returns items + `next`; infinite scroll appends; changes in filters cancel & refetch.
  - Free-text `q` flows to query; server mock filters.
- **Case timeline**:
  - `GET /admin/cases/:id` loads header; audit fetch for that `case_id` renders grouped by day; jump anchors scroll.
- **Diffs**:
  - Rows with `meta.before/after` render diff; rows with `meta.diff` render patch list.
- **Exports**:
  - CSV and NDJSON endpoints mocked; blob download called with right filename.
- **Privacy**:
  - As moderator, PII fields are redacted in `meta-pretty`.

## 3) E2E (Playwright)
- Admin opens Audit Explorer, filters by `action=action.apply` last 24h, scrolls 3 pages; expands a row and sees diff; exports NDJSON.
- Opens a case timeline via link; jumps to first action; expands revert diff.
- Saves a search, reloads page; saved search appears and applies filters.

## 4) Accessibility (axe)
- No critical violations; expanders have `aria-expanded`; export dialog labeled with role=dialog.

## 5) Performance
- Virtualization active; 10k mocked rows scroll smoothly.
- Expanding a row does not stall main thread (> 60 FPS target).

## 6) Coverage Targets
- ≥ 85% components/hooks; ≥ 80% integration; E2E smoke passes.

Directory tree (Phase F)
/parts/04-moderation/frontend/phase-f-audit-explorer/
  spec.md
  test_plan.md

/app/(staff)/admin/mod/audit/page.tsx
/app/(staff)/admin/mod/cases/[caseId]/timeline/page.tsx

/components/mod/audit/
  explorer-filters.tsx
  explorer-table.tsx
  row.tsx
  meta-pretty.tsx
  diff-view.tsx
  export-bar.tsx
  saved-searches.tsx
  stats-strip.tsx

/hooks/mod/audit/
  use-audit-list.ts
  use-audit-export.ts
  use-audit-saved.ts

/lib/
  redact-meta.ts
  download.ts
