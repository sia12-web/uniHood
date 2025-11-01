# Phase 4 — Identity & Profiles (Verification v2: SSO + Document Review + Trust Levels)

## Goal
Stronger campus trust via:
1) **Campus SSO (OAuth)** with domain whitelisting,
2) **Student Card Upload** → moderator review queue,
3) **Trust levels & badges** with expiry & re-verification,
4) **Admin review console** (approve/deny with reasons).

## Data Model (PostgreSQL 16)

-- verification attempts (one row per method run)
create table if not exists verifications (
  id uuid primary key,
  user_id uuid not null references users(id) on delete cascade,
  method text not null check (method in ('sso','doc')),
  state text not null check (state in ('pending','approved','rejected','expired')),
  evidence jsonb not null default '{}' ,           -- {provider:'google', email:'x@utoronto.ca'} or {s3_key:'...', mime:'...'}
  reason text,                                      -- moderator reason for rejection
  expires_at timestamptz,
  created_at timestamptz not null default now(),
  decided_at timestamptz
);
create index if not exists idx_verifications_user on verifications(user_id);
create index if not exists idx_verifications_state on verifications(state);

-- trust profile (one per user)
create table if not exists trust_profiles (
  user_id uuid primary key references users(id) on delete cascade,
  trust_level int not null default 0,               -- 0=unverified, 1=campus_email, 2=document, 3=sso+doc
  badge text,                                       -- 'verified', 'verified_plus'
  verified_at timestamptz,
  expires_at timestamptz,
  updated_at timestamptz not null default now()
);

-- moderator audit trail
create table if not exists verification_audit (
  id bigserial primary key,
  verification_id uuid not null references verifications(id) on delete cascade,
  moderator_id uuid not null references users(id),
  action text not null check (action in ('approve','reject')),
  note text,
  created_at timestamptz not null default now()
);

## Redis (rate limits + ephemeral)
- `rl:verify:sso:{user}:{hour}` ≤ 10/h
- `rl:verify:doc:{user}:{hour}` ≤ 6/h
- `verify:doc:upload:{user}` -> job metadata (ttl 24h)
- `admin:verify:lock:{verification_id}` -> lock for reviewer (ttl 5m)

## Campus SSO (oauth.py)
- Providers: **Google**, **Microsoft** (OIDC)
- Flow:
  - GET `/verify/sso/start?provider=google` → 302 to provider
  - GET `/verify/sso/callback` → validate `id_token`, extract `email`
  - Enforce: email domain in `campuses.domain`
  - Create `verifications` row `{method='sso', state='approved'}` with 1-year expiry
  - Update `trust_profiles` (see §5)

Security:
- PKCE, state nonce; verify audience/issuer; reject if email not verified at IdP.

## Document Upload (s3_verify.py + review)
- POST `/verify/doc/presign { mime, bytes }` → S3 key `verify/{user}/{ulid}.jpg` (≤ 6MB, image/* allowlist)
- User uploads; then POST `/verify/doc/submit { key }` → create `verifications` row `{method='doc', state='pending'}`
- Admin console:
  - GET `/admin/verify/queue?state=pending&limit=50`
  - POST `/admin/verify/{id}/decision { approve:bool, note?:string }`
  - Approve → state=approved, decided_at, optional expiry (1 year)
  - Reject → state=rejected + reason

PII Handling:
- Store only S3 key + mime; no OCR at MVP.
- Auto-expire and delete S3 object on purge job (see §7).

## Trust Levels (trust.py)
Rules:
- Level 1: campus email verified (from Part2/Phase1) → badge `verified`
- Level 2: **doc approved** → badge `verified_plus`
- Level 3: **sso approved** + doc approved → badge `verified_plus` (highest)
- Expiry: min(expires_at across active verifications) or 365 days
- Recompute on every verification state change:

def recompute_trust(user_id):
    v = load active verifications
    level = 0
    if email_verified(user_id): level = max(level, 1)
    if any(v.method=='doc' and v.state=='approved'): level = max(level, 2)
    if any(v.method=='sso' and v.state=='approved') and level>=2: level = max(level, 3)
    badge = 'verified_plus' if level>=2 else ('verified' if level>=1 else null)
    expires_at = min(active.approved.expires_at) or now()+365d
    upsert trust_profiles(user_id, level,badge,verified_at?,expires_at)

## REST API (FastAPI)

# User
GET  `/verify/status`                 -> current trust_level, badge, active verifications
GET  `/verify/sso/start`              -> redirect
GET  `/verify/sso/callback`           -> finalize SSO
POST `/verify/doc/presign`
POST `/verify/doc/submit`

# Admin
GET  `/admin/verify/queue`
POST `/admin/verify/{verification_id}/decision`

## Jobs
- Nightly: purge expired verifications and **delete S3 evidence**, downgrade trust if needed.
- Optional: notify users **30 days before expiry**.

## Frontend

**Settings → Verification**
- Wizard with two paths: **Campus SSO** or **Upload Student Card**
- Show current badge & expiry; re-verify CTA

**Admin → Verification Queue**
- Table: user, method, submitted_at, preview (signed URL), buttons approve/reject with note
- Row-level lock during review

## Validation & Limits
- Doc image ≤ 6MB; mime in image/jpeg|png|webp
- SSO only for campuses with configured provider
- Admin endpoints require role `admin` (from your auth roles)
- Rate limits per Redis keys in §2

## Observability
- `verify_sso_attempt_total{provider,result}`
- `verify_doc_submit_total{result}`
- `verify_admin_decisions_total{result}`
- `verify_trust_recompute_total`
