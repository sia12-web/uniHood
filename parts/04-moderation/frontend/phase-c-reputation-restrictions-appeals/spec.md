# Moderation · Frontend Phase C — Reputation & Restrictions UI + Appeals Resolution

## 0) Goals / Non-Goals
- Goals: Inspect user reputation & recent events; view/apply/revoke restrictions; visualize linkage; resolve appeals from case view; quick macros for enforcement.
- Non-Goals: Public-facing reputation, long-term analytics (already in Admin Dashboard API).

## 1) Routes

- `/admin/mod/users/[userId]` → Reputation & Restrictions
- `/admin/mod/users/[userId]/linkage` → Linkage graph (device/IP cluster)
- `/admin/mod/cases/[caseId]/appeal` → Appeals resolution tab (admin-only)

Also surfaces panels within **Case Detail** (Phase A) via new tabs/sidebars.

## 2) Backend Contracts (used)
- Reputation:
  - `GET /api/mod/v1/reputation/{user_id}`
  - `POST /api/mod/v1/reputation/{user_id}/adjust` (admin)
  - `GET /api/mod/v1/restrictions?user_id=&active_only=1`
  - `POST /api/mod/v1/restrictions` (create)
  - `DELETE /api/mod/v1/restrictions/{id}` (revoke)
- Linkage:
  - `GET /api/mod/v1/linkage/{user_id}`  → peers + relations
- Appeals:
  - `POST /api/mod/v1/appeals/{id}/resolve` (admin)
  - `GET  /api/mod/v1/admin/cases/{id}` (for context)
- Jobs (optional macro hooks):
  - `POST /api/mod/v1/admin/tools/run/macro` (for quick presets)

## 3) Screens & Components

### 3.1 User Reputation Page
- **Header**: user avatar/name/id, campus, verified badge, join age, risk band chip (`good|neutral|watch|risk|bad`).
- **ScoreCard**: big score (0–100), band, last event time.
- **EventsTable** (virtualized): columns → time, surface, kind, delta, summary (meta).
- **AdjustScore** (admin): delta ±, note; dry-run preview of band change before apply.
- **RestrictionsPanel**:
  - List active + expired (toggle); fields: scope, mode, reason, expires_at.
  - Actions: **Create restriction** (scope/mode/ttl/reason), **Revoke** row.
  - Info note: cooldowns from Redis may not appear here (ephemeral) — show computed status via `/restrictions/me`-style simulation endpoint when available (optional).

### 3.2 Linkage Graph
- Graph canvas (simple force layout) showing:
  - Center: target user.
  - Neighbor nodes: users sharing device/IP/cookie cluster; edge badges: relation (`shared_device`, `shared_ip_24h`) + strength.
- **Filters**: relation type, min strength, campus.
- **Node Menu**: open user reputation page, select multiple → run macro (admin) or assign cases.
- **Legend**: node color by band; shape by role (`moderator`, `admin`, `user`).

### 3.3 Case Appeals Tab (admin)
- From `/admin/mod/cases/[caseId]/appeal` or within Case Detail tab:
  - Shows appeal note, appellant, created_at, status (`pending|accepted|rejected`), reviewer info.
  - Buttons: **Accept** / **Reject** with optional note; preview of revertors to run (from Phase 6 mapping).
  - On Accept: shows checklist of actions (restore/unban/unshadow) and a confirm dialog.

### 3.4 Quick Actions
- On user pages and case sidebars:
  - **Apply Restriction Presets**: dropdown (cooldown 15m post|comment|message, shadow 24h, captcha 24h).
  - **Run Macro** preset (e.g., `harassment_strike@1`) with variable prompt (duration).

## 4) Client State (React Query)
- `['mod:rep', userId]`                → reputation summary
- `['mod:rep:events', userId, page]`   → paginated events (if server paginates)
- `['mod:restr', userId, activeOnly]`  → restrictions list
- `['mod:linkage', userId, filters]`   → linkage peers
- `['mod:case', caseId]`               → case detail (reuse Phase A)
- `['mod:appeal', caseId]`             → derived from case detail or separate fetch

## 5) Security/RBAC
- `staff.moderator` can view reputation, create **cooldown/shadow** restrictions in campus scope.
- `staff.admin` required for **score adjust**, **hard_block**, **captcha**, **appeal resolve**, macro execution.
- Server-side guard on all pages; hide admin-only controls in UI.

## 6) Accessibility
- Tables with proper headers; dialog confirms are focus-trapped.
- Graph has keyboard list view fallback (`LinkageTable`), with filterable list & “open in new tab”.

## 7) Error Handling
- Adjust score/Restriction create failure → toast + inline error; no partial UI state.
- Appeal resolve conflict (already resolved) → show current status and disable buttons.

## 8) Pseudocode (key hooks)

### 8.1 useReputation(userId)
```ts
export function useReputation(userId: string) {
  return useQuery({
    queryKey: ['mod:rep', userId],
    queryFn: () => api.get(`/reputation/${userId}`).then(r => r.data),
    staleTime: 10_000
  });
}
```

### 8.2 useRestrictions(userId)
```ts
export function useRestrictions(userId: string, activeOnly = true) {
  return useQuery({
    queryKey: ['mod:restr', userId, activeOnly],
    queryFn: () => api.get('/restrictions', { params: { user_id: userId, active_only: activeOnly ? 1 : 0 } }).then(r=>r.data)
  });
}
```

### 8.3 mutateRestriction
```ts
export function useRestrictionMutations() {
  const qc = useQueryClient();
  const create = useMutation({
    mutationFn: (req: { user_id:string; scope:string; mode:'cooldown'|'shadow_restrict'|'captcha'|'hard_block'; ttl_seconds:number; reason:string }) =>
      api.post('/restrictions', req),
    onSuccess: (_res, vars) => {
      qc.invalidateQueries({ queryKey: ['mod:restr', vars.user_id] });
      toast.success('Restriction applied');
    }
  });
  const revoke = useMutation({
    mutationFn: (id: string) => api.delete(`/restrictions/${id}`),
    onSuccess: () => toast.success('Restriction revoked')
  });
  return { create, revoke };
}
```

### 8.4 useLinkage
```ts
export function useLinkage(userId: string, filters: { relation?: string; minStrength?: number }) {
  return useQuery({
    queryKey: ['mod:linkage', userId, filters],
    queryFn: () => api.get(`/linkage/${userId}`, { params: filters }).then(r=>r.data),
    staleTime: 30_000
  });
}
```

### 8.5 resolveAppeal
```ts
export function useResolveAppeal(caseId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (req: { appeal_id: string; status: 'accepted'|'rejected'; note?: string }) =>
      api.post(`/appeals/${req.appeal_id}/resolve`, { status: req.status, note: req.note }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['mod:case', caseId] });
      toast.success('Appeal resolved');
    }
  });
}
```

## 9) UI Details
- Risk band color tokens; tooltips explain band thresholds.
- Restrictions create form defaults TTLs based on presets; validate ranges.
- Linkage graph nodes capped to 150; fallback to list for larger results.

## 10) Telemetry
- `ui_rep_restriction_created_total{mode,scope}`
- `ui_rep_restriction_revoked_total`
- `ui_rep_adjust_score_total`
- `ui_linkage_open_total`
- `ui_appeal_resolve_total{status}`

## 11) Directory Layout (Phase C additions)
```
/app/(staff)/admin/mod/users/[userId]/page.tsx
/app/(staff)/admin/mod/users/[userId]/linkage/page.tsx
/app/(staff)/admin/mod/cases/[caseId]/appeal/page.tsx

/components/mod/user/
  reputation-header.tsx
  score-card.tsx
  events-table.tsx
  adjust-score.tsx
  restrictions-panel.tsx
  new-restriction-dialog.tsx

/components/mod/linkage/
  graph.tsx
  legend.tsx
  table.tsx
  filters.tsx

/components/mod/case-appeal/
  panel.tsx
  resolve-dialog.tsx
  revertor-preview.tsx

/hooks/mod/user/
  use-reputation.ts
  use-restrictions.ts
  use-restriction-mutations.ts
  use-rep-events.ts

/hooks/mod/linkage/
  use-linkage.ts
  use-linkage-graph.ts

/hooks/mod/appeal/
  use-resolve-appeal.ts
```
