# Moderation · Backend Phase 6 — Admin Tools & Actions Catalog

## 0) Goals / Non-Goals
- Goals: define/execute reusable actions; batch tooling with dry-run; safe revert/unshadow; export/import bundles; moderator macros; robust auditability.
- Non-Goals: UI (handled in Frontend Phases), ML ranking.

## 1) Core Concepts

### 1.1 Actions Catalog (server-managed)
- Canonical catalog of **atomic** and **composed** actions:
  - Atomic: `tombstone`, `remove`, `shadow_hide`, `mute{ttl}`, `ban{scope,ttl}`, `restrict_create{targets,ttl}`, `warn{template}`, `reindex_search`, `invalidate_cache`.
  - Composed (macro): ordered list of atomic actions with **guards** (predicates) and **variables**.
- Stored versioned; only `staff.admin` may create/update; `staff.moderator` can execute.

### 1.2 Moderator Macros
- Per-organization presets (e.g., *"Spam sweep"*, *"Harassment strike"*, *"Restore & notify"*).
- Parameterized (e.g., `{duration}`, `{reason_note}`, `{targets}`).
- Refer to catalog actions by `action_key@version`.

### 1.3 Bundles (export/import)
- YAML files containing:
  - `policies` (optional references), `actions`, `macros`.
  - Signed with HMAC (org secret) for provenance.
- Import validates schema, versions, and **dry-run** before enabling.

## 2) Data Model (PostgreSQL 16)

```sql
CREATE TABLE mod_action_catalog (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  key TEXT NOT NULL,                       -- e.g., "restrict_create", "ban"
  version INT NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('atomic','macro')),
  spec JSONB NOT NULL,                     -- schema below
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_by UUID NOT NULL REFERENCES app_user(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(key, version)
);

-- Execution logs of macros/batches
CREATE TABLE mod_batch_job (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  job_type TEXT NOT NULL,                  -- 'macro','batch_revert','batch_unshadow','bundle_import'
  initiated_by UUID NOT NULL REFERENCES app_user(id),
  params JSONB NOT NULL,
  dry_run BOOLEAN NOT NULL DEFAULT FALSE,
  sample_size INT NOT NULL DEFAULT 0,      -- if >0, run on random sample first
  status TEXT NOT NULL CHECK (status IN ('queued','running','completed','failed','cancelled')),
  total INT NOT NULL DEFAULT 0,
  succeeded INT NOT NULL DEFAULT 0,
  failed INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  started_at TIMESTAMPTZ NULL,
  finished_at TIMESTAMPTZ NULL
);

CREATE TABLE mod_batch_job_item (
  job_id UUID NOT NULL REFERENCES mod_batch_job(id) ON DELETE CASCADE,
  target_type TEXT NOT NULL,
  target_id TEXT NOT NULL,
  ok BOOLEAN,
  error TEXT NULL,
  result JSONB NULL,
  PRIMARY KEY(job_id, target_type, target_id)
);
```

### 2.1 Catalog spec schema (JSON)

```json
{
  "atomic": {
    "action": "restrict_create",
    "payload": { "targets": ["post","comment"], "ttl_minutes": 60 },
    "guards": [{ "pred": "user.band_in", "args": ["risk","bad"] }]
  },
  "macro": {
    "steps": [
      { "use": "restrict_create@1", "vars": {"ttl_minutes": 120} },
      { "use": "warn@3", "vars": {"template": "spam_warning_v2"} },
      { "use": "shadow_hide@1", "when": { "pred": "subject.is_public" } }
    ]
  }
}
```

## 3) API (FastAPI) — `/api/mod/v1/admin/tools/*`

### 3.1 Catalog
- `GET /tools/actions` — list (filters: active, key, kind)
- `POST /tools/actions` — create (admin)
- `GET /tools/actions/{key}/{version}` — get
- `POST /tools/actions/{key}/{version}/deactivate` — admin

### 3.2 Macros & Batch Operations
- `POST /tools/run/macro` — run on a target set (cases or subjects)
- `POST /tools/run/batch_revert` — revert remove/mute/ban/restrict
- `POST /tools/run/batch_unshadow` — unshadow posts/comments by query
- `POST /tools/run/bundle_import` — import YAML bundle (dry-run default)

### 3.3 Simulators / Dry-run
- `POST /tools/simulate/macro` — no side-effects; returns plan per target

### 3.4 Request DTOs

```ts
// Target selector variants
 type TargetSelector =
   | { kind:'cases', ids:string[] }
   | { kind:'subjects', subject_type: 'post'|'comment'|'user'|'group'|'event', ids:string[] }
   | { kind:'query',  subject_type:'post'|'comment', filter:{ campus_id?, created_from?, created_to?, shadow_only?, actor_id? } };

 type RunMacroReq = {
   macro: string,               // e.g., "spam_sweep@2"
   selector: TargetSelector,
   dry_run?: boolean,
   sample_size?: number,        // if set, randomly sample targets
   reason_note?: string,        // appears in audit
   variables?: Record<string,any>
 };

 type BatchRevertReq = {
   actions: ('remove'|'ban'|'mute'|'restrict_create'|'shadow_hide')[],
   selector: TargetSelector,
   dry_run?: boolean, sample_size?: number
 };

 type BundleImportReq = {
   yaml: string,               // full bundle
   enable?: boolean,           // false → upload-only
   dry_run?: boolean
 };
```

## 4) Execution Engine

### 4.1 Safety rails
- Dry-run default for macros & import; explicit `dry_run=false` required to execute.
- Sample mode executes on N random targets first; requires confirmation to scale to full set.
- Idempotency: for each target, check last applied action and no-op if same decision already active.
- Guards are predicates evaluated per target/user: `user.band_in`, `case.status_in`, `subject.is_public`, `subject.created_within(hours)`, `not(subject.already_removed)`, etc.

### 4.2 Execution steps (macro)
1. Resolve macro `key@version` → steps.
2. Resolve targets from selector (query or case linkage to subject).
3. If dry-run: compute plan (per target: steps passing guards + estimated result).
4. If execute:
   - Insert `mod_batch_job` (`running`); enqueue targets to background worker.
   - For each step: call Phase 1 `apply_action()` or Phase 5 restriction functions.
   - Write `mod_action` and `mod_audit` entries; update `mod_batch_job_item`.
   - Update counters; finalize `mod_batch_job`.

### 4.3 Revert & Unshadow
- Revert inverse mapping: `remove -> restore`, `mute/ban/restrict -> revoke`, `shadow_hide -> clear shadow`.
- Unshadow query resolves flagged posts/comments, clears flag, reindexes, audits `unshadow.bulk`.

## 5) Bundle Export/Import

### 5.1 Export
- `GET /tools/actions/export.yml?keys=spam_sweep@2,warn@3`
- YAML structure:

```yaml
org: divan
version: 1
generated_at: 2025-10-29T00:00:00Z
actions:
  - key: warn
    version: 3
    kind: atomic
    spec: { action: warn, payload: { template: spam_warning_v2 } }
  - key: spam_sweep
    version: 2
    kind: macro
    spec:
      steps:
        - use: restrict_create@1
          vars: { ttl_minutes: 120 }
        - use: warn@3
```

Appends signature: `<hmac-sha256>`

### 5.2 Import
- Validate YAML schema; verify signature if present.
- Store actions into `mod_action_catalog` new versions; `is_active=false` until enabled.
- Dry-run builds diff report (`created`/`updated`/`unchanged`).

## 6) Observability & Audit
- Audit events: `catalog.action.create`, `catalog.action.deactivate`, `macro.run.{queued|completed}`, `batch.revert`, `batch.unshadow`, `bundle.import.{dry_run|enabled}`.
- Metrics: `mod_batch_jobs_total{type,status}`, `mod_batch_items_total{ok}`, `macro_step_failures_total{step_key}`, `reverts_total{action}`, `unshadow_total`, `catalog_active_actions_gauge`.

## 7) Security & RBAC
- Only `staff.admin` may create/deactivate/import catalog entries and run revert/unshadow.
- `staff.moderator` may run macros limited to campus scope; server enforces campus filter in target resolution.
- Dangerous operations require two-step confirmation (dry_run → execute with job_id reference).

## 8) Pseudocode

### 8.1 Macro simulation
```python
def simulate_macro(macro_key, selector, variables, actor):
    macro = catalog.get(macro_key)
    targets = resolve_targets(selector, actor)
    plan = []
    for t in targets:
        steps = []
        for step in macro.steps:
            if not guard_ok(step, t):
                continue
            steps.append({"use": step.use, "vars": interpolate(step.vars, variables)})
        plan.append({"target": t, "steps": steps})
    return {"count": len(plan), "plan": plan[:200]}
```

### 8.2 Job worker (shared)
```python
def process_job(job_id):
    job = db.get(mod_batch_job, job_id)
    items = db.list_items(job_id)
    db.update(job, status='running', started_at=now())
    for it in items:
        try:
            res = execute_on_target(job.job_type, job.params, it.target_type, it.target_id)
            db.update_item(job_id, it.target_type, it.target_id, ok=True, result=res)
            job.succeeded += 1
        except Exception as e:
            db.update_item(job_id, it.target_type, it.target_id, ok=False, error=str(e))
            job.failed += 1
    job.status = 'completed' if job.failed == 0 else 'failed'
    job.finished_at = now()
    db.save(job)
```

### 8.3 Revert mapping (sketch)
```python
REVERTORS = {
  "remove": lambda subject: restore_subject(subject),
  "shadow_hide": lambda subject: clear_shadow(subject),
  "mute": lambda user: revoke_restriction(user, scope="message"),
  "ban": lambda user: revoke_ban(user),
  "restrict_create": lambda user: revoke_restriction(user, scope="*"),
}
```

## 9) Failure Modes
- Reverting hard delete with missing content → logged as no-op.
- Catalog step references unknown `action@version` → job fails fast; dry-run catches.
- Import signature mismatch → reject.
- Long-running batches → chunked pagination; statement timeout 2s per chunk; resume capability via job ID.

## 10) Deliverables
- Catalog CRUD, macro runner (simulate + execute), batch revert/unshadow, bundle export/import, background worker, full audit & metrics.
