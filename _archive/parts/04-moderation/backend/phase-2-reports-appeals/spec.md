# Moderation · Backend Phase 2 — Reports, Appeals & Case Workflow

## 0) Goals / Non-Goals

- **Goals**: structured reporting (user → case), appeals intake (user → appeal case), moderator assignments, case state transitions, and audit coverage for every change.
- **Non-Goals**: full web dashboard UI (Phase 3) and automated ML prioritisation (Phase 4).

## 1) Entities (PostgreSQL 16 additions)

```sql
ALTER TABLE mod_case
  ADD COLUMN escalation_level SMALLINT NOT NULL DEFAULT 0,
  ADD COLUMN appeal_open BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN appealed_by UUID NULL REFERENCES app_user(id),
  ADD COLUMN appeal_note TEXT NULL;

CREATE TABLE mod_report (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  case_id UUID NOT NULL REFERENCES mod_case(id) ON DELETE CASCADE,
  reporter_id UUID NOT NULL REFERENCES app_user(id) ON DELETE CASCADE,
  reason_code TEXT NOT NULL,
  note TEXT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(case_id, reporter_id)
);

CREATE TABLE mod_appeal (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  case_id UUID NOT NULL REFERENCES mod_case(id) ON DELETE CASCADE,
  appellant_id UUID NOT NULL REFERENCES app_user(id),
  note TEXT NOT NULL CHECK (char_length(note) BETWEEN 10 AND 2000),
  status TEXT NOT NULL CHECK (status IN ('pending','accepted','rejected')),
  reviewed_by UUID NULL REFERENCES app_user(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  reviewed_at TIMESTAMPTZ NULL
);
```

## 2) Roles & Access

- `staff.moderator`: can view and act on cases scoped to their campus.
- `staff.admin`: can view everything, override actions, and resolve appeals.
- `system`: reserved pseudo-user for automation.

Access is controlled via JWT scope claims.

## 3) Case Workflow

### 3.1 State machine

- `open → actioned → (appeal optional) → closed`
- `open → dismissed → closed`
- `open → escalated (admin only) → actioned/dismissed`

### 3.2 Actions

- `assign` → assign to moderator
- `escalate` → increment `escalation_level`
- `action` → apply enforcement (carried forward from Phase 1)
- `dismiss` → mark dismissed
- `appeal_open` → capture user appeal submission
- `appeal_resolve` → admin accepts or rejects the appeal

Every transition writes to `mod_audit`.

## 4) Redis Streams

- `mod:reports` — receives report creation events for metrics and analytics.
- `mod:appeals` — receives appeal submissions.
- `mod:escalations` — emitted when severity meets escalation thresholds for admin notification.

## 5) API (FastAPI) — `/api/mod/v1`

### 5.1 Public (authentication required)

- `POST /reports` — Phase 1 endpoint, now extended to push to `mod:reports` and persist structured reports.
- `POST /appeals` — users appeal their own content.

Input for appeals:

```ts
type AppealIn = { case_id: string, note: string };
```

Rules:

- Only one open appeal per case.
- Allowed only when `case.status IN ('actioned','dismissed')` and the subject belongs to the caller.
- Automatically updates `mod_case.appeal_open = true` and `mod_case.appealed_by = user.id`.

### 5.2 Staff

- `GET /cases?status=open|actioned|dismissed|escalated&assigned_to=me|none`
- `POST /cases/{id}/assign`
- `POST /cases/{id}/escalate`
- `POST /cases/{id}/dismiss`
- `POST /cases/{id}/actions`
- `POST /appeals/{id}/resolve`

### 5.3 Case routes

- `POST /cases/{id}/assign { moderator_id }` → assigns case to moderator.
- `POST /cases/{id}/escalate` → increments escalation level.
- `POST /cases/{id}/dismiss { note? }` → marks dismissed with optional note.
- `POST /cases/{id}/actions { action, payload? }` → reuses Phase 1 enforcement pipeline.

### 5.4 Appeal resolve

`POST /appeals/{id}/resolve { status: 'accepted'|'rejected', note?: string }`

- Updates `mod_appeal.status`, `reviewed_by`, and `reviewed_at`.
- Sets `mod_case.status = 'closed'` and `appeal_open = false`.
- Accepted appeals trigger enforcement reversal where possible (for example, unban).

## 6) Workers

- `reports_worker`: consumes `mod:reports` to aggregate reporter metrics for trust updates.
- `appeals_worker`: listens on `mod:appeals` and notifies staff.
- `escalation_worker`: monitors severity ≥ threshold and pushes admin alerts.

## 7) Email / Notification Hooks

- Appeal creation → notify moderators and admins via internal channels.
- Appeal resolution → notify the appellant with the outcome.
- Escalation → notify admin role channel.

## 8) Audit Logging (Phase 2 additions)

Each case mutation inserts an audit event shaped like:

```json
{"case_id": "...", "action": "assign|escalate|dismiss|appeal_open|appeal_resolve", "by": "user_id", "note": "..."}
```

Stored in `mod_audit`.

## 9) Trust Updates (Phase 2)

- Reporter trust: `+1` when a case is actioned; `−1` when a report is rejected as false.
- Appellant trust: `+2` if the appeal is accepted; `−3` if rejected.

## 10) Observability

Metrics:

- `mod_reports_total`
- `mod_appeals_total`
- `mod_escalations_total`
- `mod_case_transitions_total{status}`

Include audit write latency and report → case link time.

## 11) Security & Abuse Safeguards

- Anti-report spam: per user and subject maximum of three open reports.
- Appeals limited to one per case.
- Sensitive notes stored with at-rest encryption (PostgreSQL `pgcrypto` `pgp_sym_encrypt`).
- Moderator assignment logged and protected with time-based locking to avoid double actions.

## 12) Pseudocode Snippets

Assign case:

```python
def assign_case(case_id, moderator_id, actor):
    db.execute("UPDATE mod_case SET assigned_to=%s WHERE id=%s", (moderator_id, case_id))
    audit("case.assign", actor=actor, target=case_id, meta={"moderator_id": moderator_id})
```

Submit appeal:

```python
def submit_appeal(user_id, case_id, note):
    case = repo.get_case(case_id)
    if case.subject_owner != user_id:
        raise HTTPException(403)
    if case.appeal_open:
        raise HTTPException(409)
    db.insert(mod_appeal(case_id=case_id, appellant_id=user_id, note=note, status='pending'))
    db.update(mod_case(id=case_id, appeal_open=True, appealed_by=user_id))
    xadd("mod:appeals", {"case_id": case_id})
    audit("appeal.create", actor=user_id, target=case_id, meta={"note": note[:80]})
```

Resolve appeal:

```python
def resolve_appeal(appeal_id, reviewer_id, status, note):
    db.update(mod_appeal(id=appeal_id, status=status, reviewed_by=reviewer_id, reviewed_at=now()))
    case_id = db.select("SELECT case_id FROM mod_appeal WHERE id=%s", (appeal_id,))[0]
    db.update(mod_case(id=case_id, appeal_open=False, status='closed'))
    if status == 'accepted':
        revert_enforcement(case_id)
    audit("appeal.resolve", actor=reviewer_id, target=case_id, meta={"status": status})
```

## 13) Directory Layout (Phase 2 additions)

```
/parts/04-moderation/backend/phase-2-reports-appeals/
  spec.md
  test_plan.md
  migrations/
    0210_mod_report.sql
    0211_mod_appeal.sql
  app/moderation/api/
    reports.py
    appeals.py
    cases_admin.py
  app/moderation/workers/
    reports_worker.py
    appeals_worker.py
    escalation_worker.py
```
