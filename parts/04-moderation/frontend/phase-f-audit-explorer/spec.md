# Moderation · Frontend Phase F — Audit Explorer & Timeline Diff UI

## 0) Goals / Non-Goals
- Goals: audit search UI, case & subject timelines, structured diffs for state changes, export slices, saved searches.
- Non-Goals: editing audit records (immutable), cross-instance federation.

## 1) Routes
/app/(staff)/admin/mod/audit                    → Audit Explorer (global)
/app/(staff)/admin/mod/cases/[caseId]/timeline  → Case Timeline (focused; deep link)

## 2) Backend Contracts (used)
- `GET /api/mod/v1/admin/audit?target_type?&target_id?&actor_id?&from?&to?&limit&after&q?`
- `GET /api/mod/v1/admin/cases/{id}` (context pane)
- Optional export:
  - `GET /api/mod/v1/admin/audit` with `Accept: text/csv` or `ndjson=1` (if backend supports content-negotiation)
- (No mutation endpoints in this phase)

## 3) Screens & Components

### 3.1 Audit Explorer
- **FiltersBar**: target type, target id, actor (ID/email if admin), action type (multi), time range, free-text `q`.
- **SavedSearches**: save current filter set with name; localStorage; reorder/delete.
- **AuditVirtualTable**:
  - Columns: Time, Actor, Action, Target (type/id), Meta (pretty printed), Case link (if applicable)
  - Row expand shows full JSON meta and a **DiffView** if `meta.before/after` present.
- **ExportBar**:
  - Choose format: CSV or NDJSON
  - Include fields selector: [time, actor_id, action, target_type, target_id, meta]
  - “Copy cURL” button (for reproducibility)
- **StatsStrip** (top-right): total estimate (if provided), rate (events/min) over filter window.

### 3.2 Case Timeline (Focused)
- **Header**: case id, status, severity, assigned, appeal status (fetched via `/cases/{id}`)
- **Timeline** (reverse chrono):
  - Items group by day with sticky headers
  - Each event shows: time, actor chip, action badge, brief meta summary
  - Expandable card renders **DiffView**; shows related objects (subject, restrictions)
- **JumpTo** anchors for: first report, first action.apply, appeal events, closure

### 3.3 DiffView (generic)
- Input shapes:
  - `meta.before` / `meta.after` (object)
  - Or `meta.diff` (RFC6902 JSON Patch) → render patch list
- Render modes:
  - **Keyed object diff** (two-column, added/removed/changed with badges)
  - **Patch list** (operation rows: add/replace/remove → path + value)
- Copy buttons for each block; collapse long values

## 4) Data & Hooks (React Query)
- `['mod:audit:list', hash]` → paginated events
- `['mod:case', caseId]`     → case context (reuse Phase A)
- `['mod:audit:case', caseId]` → audit filtered by `target_id=caseId`
- `['mod:audit:saved']`      → saved searches (local)

### 4.1 useAuditList
```ts
export function useAuditList(p: AuditQuery) {
  return useInfiniteQuery({
    queryKey: ['mod:audit:list', stable(p)],
    queryFn: ({ pageParam }) =>
      api.get('/admin/audit', { params: { ...p, after: pageParam, limit: 100 } }).then(r => r.data),
    getNextPageParam: (page) => page.next ?? undefined,
    staleTime: 5_000
  });
}

4.2 useAuditExport
export function useAuditExport(p: AuditQuery) {
  return async (fmt: 'csv'|'ndjson') => {
    const headers = fmt === 'csv' ? { Accept:'text/csv' } : { Accept: 'application/x-ndjson' };
    const res = await apiRaw.get('/admin/audit', { params: { ...p, ndjson: fmt==='ndjson' ? 1 : undefined }, headers, responseType:'blob' });
    return downloadBlob(res.data, `audit-${Date.now()}.${fmt}`);
  };
}
```

## 5) UX Details

Meta pretty-print: JSON rendered with collapsible nodes; long strings truncated with “more”.

Actor display: shows name/email for admin; masked ID for moderators (privacy).

Case links: if target_type='case' or meta.case_id, show link to /cases/[id]/timeline.

Row density toggle: compact/comfortable

Keyboard: f focus search, j/k scroll, Enter expand row, e export dialog, s save search

## 6) Accessibility

Table uses semantic headers; expanders are buttons with aria-expanded.

DiffView uses color + symbols and includes textual labels (“added/removed/changed”) for non-color users.

Export dialog labeled; focus trap & ESC close.

## 7) Error Handling

Network errors → sticky banner with retry.

CSV/NDJSON export unsupported → graceful fallback message with suggested curl invocation (copied to clipboard).

Empty results → guidance to widen filters.

## 8) Performance

Virtualize rows (react-virtual); 100k+ events smooth scrolling.

JSON pretty-print uses lazy rendering on expand; memoize heavy rows.

Debounce query input (300ms); cancel inflight on change.

## 9) Telemetry

ui_audit_queries_total, ui_audit_exports_total{fmt}

ui_audit_row_expanded_total, ui_audit_saved_search_used_total

First contentful load, list fetch latency

## 10) Security/Privacy

Redact PII fields for moderators in meta (server already redacts; client double checks with allowlist renderer).

Copy actions include a redaction warning tooltip.

Deep link tokens not needed; standard staff auth guard applied.

## 11) Types
type AuditEvent = {
  id: string;
  created_at: string;
  actor_id: string|null;
  action: string;           // e.g., 'policy.eval','action.apply','report.create'
  target_type: string;
  target_id: string;
  meta: Record<string, any>;
};
type AuditQuery = {
  target_type?: string;
  target_id?: string;
  actor_id?: string;
  action?: string[];        // multi
  from?: string;            // ISO
  to?: string;              // ISO
  q?: string;               // free-text if supported
};

## 12) Directory Structure (Phase F)
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
  redact-meta.ts        # client-side allowlist renderer
  download.ts
