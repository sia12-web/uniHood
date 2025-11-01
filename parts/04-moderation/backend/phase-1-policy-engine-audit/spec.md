# Moderation · Backend Phase 1 — Policy Engine & Audit Log

## 0) Goals / Non-Goals
- Goals: policy engine, detectors, enforcement hooks, reports intake, cases, audit log, queues, trust v0.
- Non-Goals: full admin console UI (Phase 3), appeals workflow (Phase 2), ML training (future).

## 1) Entities (PostgreSQL 16)

```sql
CREATE TABLE mod_policy (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL UNIQUE,
  version INT NOT NULL DEFAULT 1,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  rules JSONB NOT NULL,                      -- structured rules (see §3)
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE mod_case (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  subject_type TEXT NOT NULL CHECK (subject_type IN ('post','comment','user','group','event','message')),
  subject_id UUID NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('open','actioned','dismissed','escalated')),
  reason TEXT NOT NULL,                      -- 'report','auto_policy','escalation'
  policy_id UUID NULL REFERENCES mod_policy(id),
  severity SMALLINT NOT NULL DEFAULT 0,      -- 0..5
  created_by UUID NULL,                      -- reporter or system
  assigned_to UUID NULL,                     -- moderator (Phase 3)
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(subject_type, subject_id)           -- one active case per subject
);

CREATE TABLE mod_action (
  id BIGSERIAL PRIMARY KEY,
  case_id UUID NOT NULL REFERENCES mod_case(id) ON DELETE CASCADE,
  action TEXT NOT NULL CHECK (action IN ('none','tombstone','remove','shadow_hide','mute','ban','warn','restrict_create','restrict_invites')),
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  actor_id UUID NULL,                         -- system or moderator
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE mod_audit (
  id BIGSERIAL PRIMARY KEY,
  actor_id UUID NULL,                         -- NULL = system
  action TEXT NOT NULL,                       -- 'policy.eval','report.create','action.apply', ...
  target_type TEXT NOT NULL,
  target_id TEXT NOT NULL,
  meta JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_mod_audit_created ON mod_audit(created_at DESC);

CREATE TABLE trust_score (
  user_id UUID PRIMARY KEY,
  score SMALLINT NOT NULL DEFAULT 50,         -- 0..100
  last_event_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE user_rate_limit (
  user_id UUID PRIMARY KEY,
  window_start TIMESTAMPTZ NOT NULL,
  counters JSONB NOT NULL DEFAULT '{}'::jsonb  -- e.g., {"post_create": 3, "comment_create": 10}
);
```

2) Queues & Streams (Redis)

```
mod:ingress (XADD) — sources: Communities (post/comment/create), Socializing (messages), Reports API, Escalation endpoint.
Fields: {event_id, ts, subject_type, subject_id, actor_id?, text?, media_keys?, context_json}

mod:decisions — emits {case_id, decision, actions[], severity}

mod:actions — idempotent enforcement consumer (DB + services)
```

3) Policy Engine

### 3.1 Rule schema (stored in mod_policy.rules)
```
{
  "version": 1,
  "default_action": "none",
  "rules": [
    {
      "id": "profanity.basic",
      "when": {"text.any_of":["profanity>medium"]},
      "then": {"action":"tombstone","severity":2,"reason":"profanity"}
    },
    {
      "id": "spam.duplicate",
      "when": {"signals.all_of":["dup_text_5m","high_velocity_posts"]},
      "then": {"action":"shadow_hide","severity":2,"reason":"spam_duplicate"}
    },
    {
      "id": "nsfw.image",
      "when": {"image.any_of":["nsfw>medium"]},
      "then": {"action":"remove","severity":4,"reason":"nsfw"}
    },
    {
      "id": "trust.low_throttle",
      "when": {"user.trust_below": 20},
      "then": {"action":"restrict_create","payload":{"targets":["post","comment","message"],"ttl_minutes":60},"severity":1,"reason":"low_trust_throttle"}
    }
  ]
}
```

### 3.2 Evaluator (pseudocode)
```
def evaluate(event, detectors, user_trust, policy) -> Decision:
    sig = detectors.run(event)   # returns dict: {'profanity':'low|med|high', 'dup_text_5m':bool, 'nsfw':'low|med|high', ...}
    matches = []
    for rule in policy['rules']:
        if predicate(rule['when'], sig, user_trust):
            matches.append(rule)
    if not matches:
        return Decision(action=policy.get('default_action','none'), severity=0, reasons=[])
    # pick highest severity or compose
    winner = max(matches, key=lambda r: r.get('severity',0))
    return Decision(action=winner['then']['action'], payload=winner['then'].get('payload',{}),
                    severity=winner.get('severity',0), reasons=[r['then'].get('reason') for r in matches])
```

### 3.3 Predicates

- text.any_of: detector label thresholds (e.g., profanity>medium)
- image.any_of: NSFW etc. (Phase 1 supports placeholder that always returns unknown)
- signals.all_of: dedup, velocity, fresh-account checks
- user.trust_below: compare trust_score.score

4) Detectors (Phase 1)

- Text profanity: deterministic dictionary + heuristics (asterisk/leet variants) → levels low/med/high.
- Duplicate text (5m): Redis PFCOUNT/set of hashes per user; high overlap ⇒ dup_text_5m=true.
- Velocity: sliding window per user: posts/min, comments/min; thresholds vary by trust.
- NSFW image: stub detector returns unknown (hook for Phase 2 model).
- Link safety: basic denylist (scam domains) and excessive links>3.

5) Enforcement

### 5.1 Actions

- tombstone → soft-hide content from non-authors; keep for audit.
- remove → hard delete (author & public) + S3 cleanup for attachments.
- shadow_hide → content visible only to author (flag on row).
- mute → set group/user mute until timestamp.
- ban → mark user banned (group or global, Phase 3 extends scope).
- restrict_create → server gate that returns 429 with friendly error.
- warn → insert notification to author.

### 5.2 Idempotency

mod_action rows define canonical application; enforcement checks last applied action for case.

### 5.3 Application sites

- Communities: posts, comments, reactions, events descriptions.
- Socializing: messages (rooms/DMs).
- Identity: profile bio and display name.

6) API (FastAPI) — /api/mod/v1

```
POST   /reports                         # user reported content
GET    /cases/{case_id}                 # staff-only
POST   /policies/dry_run                # staff-only: evaluate payload, no side-effects
GET    /audit?after&limit               # staff-only
```

### 6.1 DTO sketches
```
type ReportIn = { subject_type:'post'|'comment'|'user'|'group'|'event'|'message', subject_id:string, reason_code:'abuse'|'harassment'|'spam'|'nsfw'|'other', note?:string };
type Case = { id:string, subject_type:string, subject_id:string, status:'open'|'actioned'|'dismissed'|'escalated', severity:number, policy_id?:string, created_at:string, updated_at:string };
type Decision = { action:string, payload?:Record<string,any>, severity:number, reasons:string[] };
```

### 6.2 Reports flow

- Insert/Upsert mod_case (create if absent).
- XADD mod:ingress with reason=report.
- Audit report.create.

7) Workers

#### 7.1 ingress_worker
```
while True:
  msgs = redis.xread({"mod:ingress": last_id}, block=5000, count=100)
  for m in msgs:
    event = parse(m)
    user_trust = repo.trust(event.actor_id)
    decision = evaluate(event, detectors, user_trust, active_policy())
    case = upsert_case(event, decision)
    xadd("mod:decisions", {..., "case_id":case.id, "decision":decision.action})
    audit("policy.eval", target=event['subject_id'], meta={"decision":decision.__dict__})
```

#### 7.2 actions_worker
```
for msg in xread({"mod:decisions": last_id}):
  d = parse(msg)
  if already_applied(d.case_id, d.decision): continue
  apply_action(d.case_id, d.decision, d.payload)   # calls domain services
  insert(mod_action, case_id=d.case_id, action=d.decision, payload=d.payload)
  update(mod_case set status='actioned' where id=d.case_id)
  audit("action.apply", target=d.case_id, meta={"action": d.decision})
```

#### 7.3 trust_updater

Inputs: positive events (age, accepted invites, verified email) and negative (reports, policy hits).

Rule of thumb v0:

- +1/day up to 70; +5 on verified email; +3 per accepted invite (cap).
- -10 on policy hit tombstone/remove; -5 on 3+ reports (unique reporters) in 24h.

8) Request Gates (service middleware)

Before write operations (create post/comment/message), run enforce_create_guard(user_id, subject_type):

- if trust_score(user_id) < 10: deny(429,"account_limited")
- if rate_limit_exceeded(user_id, subject_type): deny(429,"slow_down")
- if user_muted(user_id): deny(403,"muted_until")

9) Observability

Metrics:

- mod_events_ingressed_total, mod_decisions_total{action}, mod_actions_failed_total,
- mod_policy_eval_duration_ms, mod_reports_total, trust_score_changes_total.

Logs: structured with case_id, subject_type, subject_id, actor_id, policy_id.

10) Security & Privacy

- Audit log append-only; no edits (only redactions by super-admin in Phase 3).
- Staff endpoints require role staff.moderator or above; IP allowlist optional.
- Reporter anonymity preserved to reported user.
- PII scrubbing in audit meta where not needed.

11) Migrations order

```
0200_mod_policy.sql
0201_mod_case.sql
0202_mod_action.sql
0203_mod_audit.sql
0204_trust_score.sql
0205_user_rate_limit.sql
```

12) Seed

- Default policy v1 with rules from §3.1.
- Trust scores = 50 for all existing users.

13) Failure modes

- Redis down: buffer in DB table mod_ingress_fallback (optional), or return 202 and retry later.
- Detector errors: treat as unknown, continue with remaining signals.
- Enforcement failure: DLQ to mod:actions_dlq and alert.

14) Integration points (Phase 1 coverage)

- Communities API hooks: posts/comments/events create/update, group/profile text fields.
- Socializing: room/DM message create.
- Escalation endpoint from Communities (Phase 6) writes directly to mod:ingress.
