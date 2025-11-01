# Moderation · Frontend Phase B — Content Safety Review & Hash Lists UI

## 0) Goals / Non-Goals
- **Goals**: review quarantined items deeply; inspect OCR & signals; approve/block/tombstone; manage perceptual hash DB; edit scanning thresholds; view URL verdict history.
- **Non-Goals**: building or hosting ML; end-user safety settings UI.

## 1) Routes

```
/admin/mod/quarantine/[attachmentId] → Quarantine Detail (image/file)
/admin/mod/safety/thresholds      → Threshold editor (text/image/url)
/admin/mod/safety/hashes          → Hashes list (search/import/export)
/admin/mod/safety/hashes/import   → Import wizard
/admin/mod/safety/urls            → URL reputation viewer
```

## 2) Data Contracts (used)
- Quarantine: `GET /quarantine?status=...`, `GET /attachments/{id}`, `POST /quarantine/{id}/decision`
- Text scans: `GET /text_scans?subject_type&subject_id`
- URL scans: `GET /url_scans?url|final_url|etld1&after&limit`
- Hash DB: `GET /hashes?algo&hash&label&after&limit`, `POST /hashes/import`, `DELETE /hashes/{id}` (admin)
- Thresholds: `GET /safety/thresholds`, `POST /safety/thresholds/simulate`, `POST /safety/thresholds/apply` (admin; requires prior simulate token)
- Audit: `GET /admin/audit?target_id=...`
- Staff guard: `/me` scopes

> Align keys with Back-end Phase 4 `openapi.yml` (`hashes_admin.py`, `quarantine.py`) and Phase 6 tools.

## 3) Screens & Components

### 3.1 Quarantine Detail
- **Header**: attachment id, subject link (post/comment), owner, created_at, safety_status.
- **Preview**:
  - Image: blurred by default; **Reveal** button (requires role + justification note; emits audit `media.reveal`).
  - File: icon + download (time-limited signed URL).
- **Signals Panel**:
  - NSFW/gore horizontal bars with exact scores.
  - pHash/PDQ value (copy button); match label if found.
  - OCR snippet with “View full OCR” drawer.
  - Link to associated text scan record.
- **Actions**:
  - **Clean** (publish/restore), **Tombstone**, **Block** (hard delete) — confirm dialog, optional note.
  - Batch next/prev arrows (keyboard: `J/K`) to traverse current filtered queue.
- **Sidebar**:
  - Subject metadata (group, campus, visibility).
  - Reporter count/case link if exists.
  - Recent author actions (mini reputation panel).

### 3.2 Thresholds Editor
- Tabs: **Text**, **Image**, **URL**.
- Sliders/inputs for hard/soft thresholds (e.g., toxicity, harassment, hate, nsfw, gore).
- **Simulate**: submit time window + sample size; backend returns **impact report** with counts for clean/review/quarantine/block deltas and false-positive estimate.
- **Apply**: requires simulate token (valid 15 minutes) and admin confirmation.
- Shows current `moderation.yml` snapshot (read-only) with change diff highlighting.

### 3.3 Hash Lists Management
- **Table**: columns → Algo, Hash (shortened), Label, Source, Created, Actions.
- Search by hash prefix (live), filter by label/algo/source.
- Row actions: **Delete** (admin only; confirm), **Copy** hash, **Reveal** details.
- **Import Wizard**:
  - Upload CSV or YAML; preview parsed rows with validation (algo, hash length, label in allowlist).
  - Select label and source defaults; dry-run; then **Import** → progress modal (streams job log if supported).
- **Export**: current filtered slice → YAML with HMAC signature (download).

### 3.4 URL Reputation Viewer
- Search bar (url or eTLD+1); results table:
  - Final URL, eTLD+1, Verdict, Lists (chips), First seen, Last 10 subjects linked.
- Row expands to show redirects chain and sample posts/comments.

## 4) State & Hooks (React Query)
- `['mod:q:item', attachmentId]` → `GET /attachments/{id}` + scans
- `['mod:q:text', subjectKey]`    → text scan record
- `['mod:safety:thresholds']`
- `['mod:safety:simulate', hash]`
- `['mod:hashes', filtersHash]`
- `['mod:url', queryHash]`

## 5) Security & Privacy
- Blur sensitive media by default; reveal logs an audit entry and redacts OCR in UI until reveal.
- Hash import requires `staff.admin`; file stored only in memory client-side; send rows batched to API.
- Threshold apply requires **simulate token** from latest simulate call.
- PII in OCR not persisted client-side after leaving page.

## 6) Accessibility
- All dialogs focus-trapped; buttons have descriptive labels.
- Sliders provide numeric inputs; bars include text percentages.
- Table rows keyboard-navigable; preview reveal is a toggle with `aria-pressed`.

## 7) Error Handling
- Quarantine decision 409 → show note with latest status, refresh item.
- Import parse errors surfaced inline per-row; allow skip invalid rows.
- Simulate/apply race → require latest simulate token; backend returns 409 if stale.

## 8) Pseudocode Snippets

### 8.1 useQuarantineItem
```ts
export function useQuarantineItem(attachmentId: string) {
  return useQuery({
    queryKey: ['mod:q:item', attachmentId],
    queryFn: async () => {
      const att = await api.get(`/attachments/${attachmentId}`).then(r=>r.data);
      const text = att.subject_type ? await api.get('/text_scans', { params: { subject_type: att.subject_type, subject_id: att.subject_id } }).then(r=>r.data) : null;
      return { att, text };
    },
    staleTime: 10_000
  });
}
```

### 8.2 Decision mutation
```ts
const decide = useMutation((p:{id:string; verdict:'clean'|'tombstone'|'blocked'; note?:string}) =>
  api.post(`/quarantine/${p.id}/decision`, p),
  { onSuccess: () => {
      qc.invalidateQueries({queryKey:['mod:quarantine']});
      toast.success('Decision applied');
  } }
);
```

### 8.3 Thresholds simulate/apply
```ts
const simulate = useMutation((body) => api.post('/safety/thresholds/simulate', body));
const apply    = useMutation((body) => api.post('/safety/thresholds/apply', body)); // includes simulate_token
```

### 8.4 Hash import (client)
```ts
function parseHashFile(file: File): ParsedRow[] { /* csv/yaml → rows with {algo, hash, label, source} */ }
async function importRows(rows: ParsedRow[]) {
  for (const chunk of chunked(rows, 500)) {
    await api.post('/hashes/import', { rows: chunk });
  }
}
```

## 9) Visual Notes
- Use shadcn Card, Tabs, AlertDialog, Drawer.
- Score bars use subtle gradient; exact values printed to avoid color-only communication.
- Hash list uses mono font for hash column.

## 10) Telemetry
- `ui_safety_quarantine_reveals_total`
- `ui_safety_decisions_total{verdict}`
- `ui_safety_thresholds_simulate_total`
- `ui_safety_hash_import_rows_total`
- `ui_safety_url_queries_total`

## 11) Directory Structure (Phase B additions)
```
/app/(staff)/admin/mod/quarantine/[attachmentId]/page.tsx
/app/(staff)/admin/mod/safety/thresholds/page.tsx
/app/(staff)/admin/mod/safety/hashes/page.tsx
/app/(staff)/admin/mod/safety/hashes/import/page.tsx
/app/(staff)/admin/mod/safety/urls/page.tsx

/components/mod/safety/
  quarantine-detail.tsx
  signals-panel.tsx
  ocr-drawer.tsx
  score-bars.tsx
  decision-bar.tsx
  thresholds-editor.tsx
  thresholds-sim-result.tsx
  hash-table.tsx
  hash-import-wizard.tsx
  url-rep-table.tsx

/hooks/mod/safety/
  use-quarantine-item.ts
  use-thresholds.ts
  use-thresholds-simulate.ts
  use-hashes.ts
  use-hash-import.ts
  use-url-rep.ts
```
