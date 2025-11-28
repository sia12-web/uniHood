# Moderation · Frontend Phase A — Moderator Console UI

## 0) Goals / Non-Goals
- Goals: Moderation workspace: cases list/detail, quarantine review, run macros (simulate/execute), monitor batch jobs, audit viewer, reputation panel.
- Non-Goals: End-user reporting UI (already in communities), export analytics charts (later), push/email preferences.

## 1) Tech
- Next.js (App Router) + TypeScript + Tailwind + shadcn/ui
- Data: React Query; MSW for tests; Axios client `/api/mod/v1`
- Realtime: socket.io-client (namespace `/staff`)
- RBAC: require `staff.moderator` or `staff.admin` via server-side guard

## 2) Routes


/admin/mod
/cases → list + filters + bulk select + batch actions
/cases/[caseId] → detail: timeline, actions, reporters, appeals, subject preview
/quarantine → needs_review/quarantined attachments
/jobs → batch jobs monitor (status/progress/logs)
/tools/macro → macro runner (simulate → execute)


## 3) Layout & Navigation
- Left rail: Cases, Quarantine, Jobs, Tools
- Top bar: campus scope selector (admin sees “All | My campuses”), quick search, user menu
- Breadcrumbs reflect section; keyboard shortcuts:
  - `f` focus search, `s` toggle filters, `a` select all (list), `?` help

## 4) Data Contracts (used)
- Cases: `GET /admin/cases`, `GET /admin/cases/{id}`, `POST /admin/cases/batch_action`
- Audit: `GET /admin/audit?target_id=...`
- Quarantine: `GET /quarantine`, `POST /quarantine/{id}/decision`
- Jobs: `GET /tools/jobs?after&limit` (list), Socket: `job.updated`, `job.completed`
- Macros: `POST /tools/simulate/macro`, `POST /tools/run/macro`
- Reputation: `GET /reputation/{user_id}`, `GET /restrictions?user_id=...`, `POST /restrictions` (manual)
- Self guard: `GET /me` → scopes + campuses

## 5) Key Screens & Components

### 5.1 Cases List
- `CasesFilters`: status, severity range, subject type, assigned (me/none), appeal, date range, campus
- `CasesTableVirtual`: columns: ID, Severity, Status, Subject (type/id), Reason, Assigned, Updated, Actions
- Bulk actions dropdown:
  - Assign to me
  - Escalate
  - Dismiss (with note)
  - Apply enforcement (choose decision)
- Pagination: keyset `after` cursor; infinite scroll or “Load more”
- Row indicators: appeal_open badge; escalation level chip; campus tag

### 5.2 Case Detail
- Header: case meta + quick actions (assign/escalate/dismiss/apply action)
- Tabs:
  - **Timeline**: audit entries, decisions, reports, appeals
  - **Subject**: inline preview (post/comment text, attachments thumbnails; open in context)
  - **Reporters**: list with counts (PII redactions for moderators)
  - **Appeal**: status, note, resolve (admin only)
  - **Reputation**: score band, last events, active restrictions; quick add/remove restriction
- Right panel: suggested actions (from policy signals), quick macros

### 5.3 Quarantine Queue
- Filters: status (`needs_review|quarantined`), type (image/file), campus, time
- Card grid:
  - Media preview (safe blur; click to reveal)
  - Safety scores (nsfw/gore), OCR snippet, owner, subject link
  - Decisions: **Clean**, **Tombstone**, **Block** (confirm)
- Batch mode: select multiple → apply decision; reason note optional

### 5.4 Jobs Monitor
- Table: Job ID, Type, Status, Progress (succeeded/total), Started/Finished, Initiated by, Dry-run?
- Detail drawer: per-item results (ok/error), downloadable NDJSON log
- Live updates via socket `/staff` events

### 5.5 Macro Runner
- Form: `macro key@version`, target selector (cases IDs, subject IDs, or query builder)
- Step 1 (simulate): renders plan preview (first 200 targets)
- Step 2 (execute): requires confirm; optional sample size; shows spawned job link

## 6) Hooks & State (React Query keys)
- `['mod:cases', filtersHash]`, `['mod:case', caseId]`
- `['mod:audit', targetId]`
- `['mod:quarantine', filtersHash]`
- `['mod:jobs']`, `['mod:job', jobId]`
- `['mod:macro:plan', hash]`
- `['mod:reputation', userId]`, `['mod:restrictions', userId]`

## 7) Auth Guard (server)
- `requireStaff(scope: 'moderator'|'admin')`:
  - Fetch `/me`, assert scopes
  - Inject campus scope into search params by default (unless admin selects “All”)

## 8) Accessibility
- List: `role="table"` with proper headers; row action menus keyboard accessible
- Quarantine previews: `aria-pressed` toggles reveal; warning text for sensitive media
- Macro runner: form labels; results region uses `aria-live="polite"`

## 9) Error/Empty States
- Network error banners with retry
- No cases → guidance text with filter tips
- Quarantine empty → “No items awaiting review”

## 10) Pseudocode (key pieces)

### 10.1 useCases
```ts
export function useCases(params: CasesQuery) {
  return useInfiniteQuery({
    queryKey: ['mod:cases', stable(params)],
    queryFn: ({ pageParam }) => api.get('/mod/v1/admin/cases', { params: { ...params, after: pageParam, limit: 50 } }).then(r=>r.data),
    getNextPageParam: (page) => page.next ?? undefined,
    staleTime: 10_000
  });
}

10.2 Bulk actions
const bulk = useMutation({
  mutationFn: (req: BatchReq) => api.post('/mod/v1/admin/cases/batch_action', req),
  onSuccess: () => {
    qc.invalidateQueries({ queryKey: ['mod:cases'] });
    toast.success('Batch action queued');
  },
  onError: () => toast.destructive('Batch action failed')
});

10.3 Quarantine decision
function useQuarantineDecision() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (p: { id: string; verdict: 'clean'|'tombstone'|'blocked'; note?: string }) =>
      api.post(`/mod/v1/quarantine/${p.id}/decision`, { verdict: p.verdict, note: p.note }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['mod:quarantine'] })
  });
}

10.4 Macro simulate → execute
const simulate = useMutation((req: RunMacroReq) => api.post('/mod/v1/admin/tools/simulate/macro', req));
const execute  = useMutation((req: RunMacroReq) => api.post('/mod/v1/admin/tools/run/macro', { ...req, dry_run:false }));

10.5 Jobs socket
useEffect(() => {
  const s = io('/staff', { withCredentials: true });
  s.on('job.updated', (evt) => qc.setQueryData(['mod:job', evt.id], (j:any)=>({ ...j, ...evt })));
  s.on('job.completed', () => qc.invalidateQueries({ queryKey: ['mod:jobs'] }));
  return () => s.disconnect();
}, []);

11) Security & Privacy

Redact reporter PII for moderators (admin toggle can reveal)

Hide OCR full text by default; reveal only on click (audit that reveal)

All state-changing operations require CSRF intent header and display confirmation

12) Performance

Virtualize case list and quarantine grid; overscan=6

Debounce filters; cancel inflight queries on change

Memoize heavy rows; use skeletons for smooth perception

13) Telemetry

UI metrics: ui_mod_cases_filters_changed_total, ui_mod_bulk_actions_submitted_total, ui_mod_quarantine_decisions_total

Send timings of list fetches to /api/metrics/ui

14) Deliverables

Pages + components + hooks + tests; CI runs unit + integration + Playwright smoke
