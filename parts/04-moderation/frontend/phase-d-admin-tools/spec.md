# Moderation · Frontend Phase D — Admin Tools & Macros Runner UI

## 0) Goals / Non-Goals
- Goals: Operate Phase 6 admin tools safely: catalog list/create/deactivate, simulate & run macros, batch unshadow/revert, bundle import/export, job drill-down with live progress.
- Non-Goals: Non-staff access, analytics charts (in admin dashboard), writing moderation policies.

## 1) Routes (App Router)

```
/admin/mod/tools
/admin/mod/tools/catalog → list + create/deactivate
/admin/mod/tools/macros → simulate/execute on selectors
/admin/mod/tools/unshadow → query → preview → execute
/admin/mod/tools/revert → choose actions → selector → execute
/admin/mod/tools/bundles → export/import wizard
/admin/mod/tools/jobs → list
/admin/mod/tools/jobs/[jobId] → details + per-item results
```

## 2) RBAC
- Guarded by server with `staff.admin`. Hide/redirect if only `staff.moderator`.
- Confirmations for all destructive operations. Dry-run is default; **execute** requires explicit confirm.

## 3) Backend contracts used
- Catalog: `GET /tools/actions`, `POST /tools/actions`, `GET /tools/actions/{key}/{version}`, `POST /tools/actions/{key}/{version}/deactivate`
- Macros: `POST /tools/simulate/macro`, `POST /tools/run/macro`
- Batch:  `POST /tools/run/batch_unshadow`, `POST /tools/run/batch_revert`
- Bundles: `GET /tools/actions/export.yml`, `POST /tools/run/bundle_import`
- Jobs: `GET /tools/jobs?after&limit`, `GET /tools/jobs/{id}`, socket `/staff`: `job.updated`, `job.completed`
- Common selectors: `{ kind: 'cases'|'subjects'|'query', ... }` (Phase 6 DTOs)

## 4) Screens & Components

### 4.1 Tools Home
- Cards linking to Catalog, Macros, Unshadow, Revert, Bundles, Jobs.
- Safety checklist (dry-run hint, sample mode, RBAC note).

### 4.2 Actions Catalog
- **CatalogTable**: columns → Key, Version, Kind (atomic/macro), Active, Created by, Created at, Actions.
- **CreateActionDialog** (admin):
  - Tabs: Atomic | Macro
  - JSON editor (monaco) with client schema validation; show guard spec helpers.
  - Submit → `POST /tools/actions`
- **Deactivate** button → confirm dialog → `…/deactivate`.

### 4.3 Macro Runner (Admin)
- **SelectorBuilder**:
  - Modes: Cases IDs, Subjects IDs, Query (subject_type, campus, date range, shadow_only, actor_id)
- **MacroForm**: input `macro key@version`, variables map, reason note, sample size.
- Step 1: **Simulate** → render **PlanPreview** (summary counts + first 200 targets w/ steps).
- Step 2: **Execute** (requires confirm) → spawns job; link to job details.

### 4.4 Batch Unshadow
- Query builder (subject_type=post|comment, campus, created range, actor, shadow_only=true).
- **Preview**: count estimate + sample list (first 200).
- **Execute**: dry-run by default; **Run** after confirm → job.

### 4.5 Batch Revert
- Pick actions to revert: `remove | ban | mute | restrict_create | shadow_hide`.
- Selector builder (cases/subjects/query).
- Preview affected estimate; **Execute** after confirm → job.

### 4.6 Bundles
- **Export**: select actions by keys (multi-select with search) → `GET export.yml` download.
- **ImportWizard**:
  - Upload YAML → show diff: created/updated/unchanged counts.
  - **Dry-run** first; then **Enable** (execute) after confirm.
  - Show HMAC signature status.

### 4.7 Jobs
- Jobs list table: Job ID, Type, Status, Dry-run?, Total, Succeeded, Failed, Started/Finished, Initiator.
- Job details:
  - Progress bar, live updates via socket, **NDJSON** log download.
  - **ResultsTable** (virtualized): target, ok/error, message.
  - If failed items exist → export failed IDs (CSV) for retry.

## 5) State & Data (React Query keys)
- `['tools:catalog', filters]`
- `['tools:macro:plan', hash]`, `['tools:macro:exec', jobId]`
- `['tools:unshadow:preview', hash]`, `['tools:revert:preview', hash]`
- `['tools:bundles:diff', hash]`
- `['tools:jobs']`, `['tools:job', jobId]`

## 6) UX Safety Rails
- All execute buttons disabled until a **recent simulate** exists (<15 min) when applicable.
- Require typing **RUN** to confirm critical executes.
- Sample mode prominently shown; default sample=10 on high-risk actions.
- Display campus scope warning if selector omits campus.

## 7) Accessibility
- Editors labeled; buttons have explicit names; tables keyboard navigable.
- Confirmation dialogs are focus-trapped; execution summaries announce via `aria-live="polite"`.

## 8) Error Handling
- Backend 409 (no prior simulate token) → show toast + banner to re-simulate.
- Validation failures in JSON editor show line/col markers; prevent submit.
- Socket disconnect shows passive banner; polling fallback for jobs.

## 9) Performance
- Virtualize large tables; debounce query builders; memoize plan rendering.
- Lazy-load monaco editor only when needed.

## 10) Pseudocode highlights

### 10.1 useMacroSimulate/Execute
```ts
export function useMacroSimulate() {
  return useMutation((req: RunMacroReq) => api.post('/admin/tools/simulate/macro', req).then(r=>r.data));
}
export function useMacroExecute() {
  return useMutation((req: RunMacroReq) => api.post('/admin/tools/run/macro', { ...req, dry_run:false }).then(r=>r.data));
}
```

### 10.2 useJobs socket
```ts
useEffect(() => {
  const s = io('/staff', { withCredentials: true });
  s.on('job.updated', (evt) => qc.setQueryData(['tools:job', evt.id], (j:any)=>({ ...j, ...evt })));
  s.on('job.completed', () => qc.invalidateQueries({ queryKey: ['tools:jobs'] }));
  return () => s.disconnect();
}, []);
```

### 10.3 Catalog create
```ts
const createAction = useMutation((body:{ key:string; kind:'atomic'|'macro'; version:number; spec:any }) =>
  api.post('/admin/tools/actions', body)
);
```

### 10.4 Batch unshadow execute
```ts
const runUnshadow = useMutation((body) => api.post('/admin/tools/run/batch_unshadow', body), {
  onSuccess: (res) => router.push(`/admin/mod/tools/jobs/${res.job_id}`)
});
```

## 11) Telemetry

- `ui_tools_macro_simulate_total`, `ui_tools_macro_execute_total`
- `ui_tools_unshadow_execute_total`, `ui_tools_revert_execute_total`
- `ui_tools_bundle_import_total{dry_run|execute}`, `ui_tools_catalog_create_total`
