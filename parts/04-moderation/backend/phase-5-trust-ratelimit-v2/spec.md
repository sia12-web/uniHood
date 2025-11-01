# Moderation · Backend Phase 5 — Trust & Rate-Limit v2 + Reputation Signals

## 0) Goals / Non-Goals
- Goals: unified reputation model, graduated enforcement, device/IP/ASN telemetry, cross-surface velocity + bursts, cooldowns & shadow restrictions, staff visibility & overrides, privacy-aware storage.
- Non-Goals: complex ML; federation; long-term device tracking beyond hashed identifiers.

## 1) Data Model (PostgreSQL 16)

```sql
-- Device & Network
CREATE TABLE mod_device (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES app_user(id) ON DELETE CASCADE,
  fp_hash TEXT NOT NULL,                        -- stable hash from client hints; salted server-side
  user_agent TEXT NULL,
  first_seen TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_seen  TIMESTAMPTZ NOT NULL DEFAULT now(),
  seen_count INT NOT NULL DEFAULT 1,
  UNIQUE(user_id, fp_hash)
);

CREATE TABLE mod_ip_reputation (
  ip INET PRIMARY KEY,
  asn INT NULL,
  risk_label TEXT NOT NULL DEFAULT 'unknown',   -- 'unknown'|'residential'|'dc'|'vpn'|'tor'|'hosting'|'school'
  score SMALLINT NOT NULL DEFAULT 50,           -- 0..100 higher worse
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE mod_user_reputation (
  user_id UUID PRIMARY KEY REFERENCES app_user(id) ON DELETE CASCADE,
  score SMALLINT NOT NULL DEFAULT 50,           -- 0..100 higher worse
  last_event_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  bands TEXT NOT NULL DEFAULT 'neutral'         -- 'good'|'neutral'|'watch'|'risk'|'bad'
);

CREATE TABLE mod_reputation_event (
  id BIGSERIAL PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES app_user(id) ON DELETE CASCADE,
  device_fp TEXT NULL,
  ip INET NULL,
  surface TEXT NOT NULL,                        -- 'post'|'comment'|'message'|'invite'|'upload'|'signup'
  kind TEXT NOT NULL,                           -- 'good'|'bad' code, e.g., 'accepted_invite','report_hit','velocity_trip'
  delta SMALLINT NOT NULL,                      -- positive increases risk; negative decreases
  meta JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Graduated restrictions (ledger)
CREATE TABLE mod_user_restriction (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES app_user(id) ON DELETE CASCADE,
  scope TEXT NOT NULL,             -- 'global' or surface: 'post'|'comment'|'message'|'invite'|'upload'
  mode TEXT NOT NULL,              -- 'cooldown'|'shadow_restrict'|'captcha'|'hard_block'
  reason TEXT NOT NULL,
  ttl_seconds INT NOT NULL,        -- time-based; 0 for until revoke
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by UUID NULL,            -- NULL = system
  expires_at TIMESTAMPTZ GENERATED ALWAYS AS (created_at + make_interval(secs => ttl_seconds)) STORED
);
CREATE INDEX idx_mod_user_restr_user ON mod_user_restriction(user_id);
CREATE INDEX idx_mod_user_restr_scope ON mod_user_restriction(scope);

-- Abuse correlations (privacy-aware)
CREATE TABLE mod_linkage (
  cluster_id UUID NOT NULL,
  user_id UUID NOT NULL,
  relation TEXT NOT NULL,          -- 'shared_device'|'shared_ip_24h'|'shared_cookie_seed'
  strength SMALLINT NOT NULL,      -- 1..100
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (cluster_id, user_id, relation)
);
```

Redis (counters/sets)

rl:{surface}:{user} → sliding window counters (per 60s/5m/1h).

burst:{surface}:{user} → short 10s bucket for spike detection.

dev:{fp}:users (set) & ip:{ip}:users → distinct users per fingerprint/IP in 24h.

cooldown:{user}:{surface} TTL key.

shadow:{user}:{surface} flag key.

honey:trip:{user} counters.

## 2) Client telemetry (minimal, privacy-aware)

Device fingerprint (client-side stable hash) derived from non-sensitive hints (UA, platform, timezone, locale) + server salt (rotated monthly).

First-party cookie cid (random UUID) to help cluster multi-account attempts. No cross-site tracking.

## 3) Reputation Model
### 3.1 Score aggregation (risk ↑ with larger score)

Base from Phase 1 trust_score inverted into risk: risk = 100 - trust.

Add IP factor: min(+20, map(ip.score,50→0,100→20)).

Add device factor: +10 if device shared across ≥3 accounts within 24h.

Velocity factor: +{5,10,15} for trips on 5m/1h/24h windows respectively.

Content factors: +15 for policy tombstone/remove in last 7d (decay 0.5 every 7d).

Positive signals (subtract; floor at 0): −5 verified email, −3 accepted invite (cap −9/7d), −5 age>30d.

Bands: 0..25 good, 26..45 neutral, 46..60 watch, 61..80 risk, >80 bad.

### 3.2 Decay (run hourly)

score = clamp( score - floor(score * 0.05), 0, 100 ) for users in watch|risk|bad bands with no new negatives in 24h.

## 4) Graduated Enforcement

| Condition | Action | TTL |
| --- | --- | --- |
| First velocity trip (surface) | cooldown (soft 429 with message) | 15 min |
| 2 trips in 60m or risk band≥risk | cooldown escalate | 60 min |
| risk band=bad or IP=TOR/DC+velocity | shadow_restrict on write surfaces | 24 h |
| Honey-action tripped (see §6) | captcha requirement + shadow_restrict | 24 h |
| Repeated policy hits (remove ≥2/24h) | hard_block (global write) | 24–72 h (config) |

Cooldown returns 429 cooldown_active with retry_after seconds.

Shadow restrict returns 200 to author but content is hidden to others (server sets shadow flag).

Captcha mode: require successful captcha token on write; else 403.

## 5) Velocity Models (per surface)

```
post:
  window_60s: 3
  window_5m: 8
  window_1h: 20
comment:
  window_60s: 10
  window_5m: 40
  window_1h: 200
message:
  window_10s: 8
  window_60s: 30
invite:
  window_1h: 10
upload:
  window_10m: 10
```

Dynamic lowering for watch|risk|bad bands (e.g., ×0.7, ×0.5, ×0.3).

## 6) Evasion Detection & Honey-actions

Shared device/IP clustering: when a new account appears on a device with ≥2 banned/shadowed accounts in 7d → auto watch and pre-cooldown invite & message surfaces.

Fast-cycling signup: multiple signups from same IP/ASN within 10 min → mark IP as dc|vpn risk +10 and enforce captcha on signup.

Honey-actions: invisible UI/no-op endpoints (e.g., POST /posts?hidden_field present only to bots). Any call → immediate captcha + shadow_restrict for 24h; event logged honey_trip.

Link velocity: new accounts posting ≥3 unique external links in 10 min → link cool-off (shadow link stripping for 24h).

## 7) Request Gate (v2)

```
def enforce_write_gate(user_id: UUID, surface: str, ctx: Ctx):
    # 0) Check restrictions ledger/TTL flags
    if redis.get(f"cooldown:{user_id}:{surface}"):
        retry = redis.ttl(f"cooldown:{user_id}:{surface}")
        raise HTTPException(429, detail={"code":"cooldown_active","retry_after":retry})
    if redis.get(f"shadow:{user_id}:{surface}"):
        ctx.shadow = True  # downstream creates shadowed content

    # 1) Velocity windows
    now = int(time.time())
    if trip := velocity_trip(user_id, surface, now):
        apply_cooldown(user_id, surface, minutes=trip.ttl)
        record_rep_event(user_id, "velocity_trip", +5, surface, ctx)

    # 2) Captcha
    if user_requires_captcha(user_id) and not ctx.captcha_ok:
        raise HTTPException(403, detail={"code":"captcha_required"})

    # 3) Link cooloff (for posts/comments)
    if surface in ("post","comment") and link_cooloff_active(user_id) and contains_external_links(ctx.text):
        ctx.strip_links = True

    # 4) Final risk band escalation
    band = reputation_band(user_id)
    if band in ("risk","bad") and surface in ("invite","message","post"):
        maybe_shadow(user_id, surface, ttl_hours=24)
```

## 8) Reputation Updates

```
def record_rep_event(user_id, kind, delta, surface, ctx):
    db.exec("INSERT INTO mod_reputation_event(user_id, device_fp, ip, surface, kind, delta, meta) VALUES (...)")
    # rolling aggregation
    r = db.fetch_one("SELECT score FROM mod_user_reputation WHERE user_id=%s FOR UPDATE", [user_id])
    new_score = clamp(r.score + delta, 0, 100)
    band = to_band(new_score)
    db.exec("UPDATE mod_user_reputation SET score=%s, bands=%s, last_event_at=now() WHERE user_id=%s",
            [new_score, band, user_id])

def velocity_trip(user_id, surface, now):
    # increment windows
    incr(now_bucket("60s"), 1); incr(now_bucket("5m"), 1); ...
    thresholds = cfg.surface[surface]
    if over(thresholds.window_60s) or over(thresholds.window_5m) or over(thresholds.window_1h):
        return Trip(ttl=choose_ttl(surface))
```

## 9) Staff & Self APIs — /api/mod/v1
```
# Self (user can see their active restrictions)
GET  /restrictions/me                        → { items: [{scope,mode,expires_at,reason}] }

# Staff
GET  /reputation/{user_id}                   → score, band, last events (paginated)
POST /reputation/{user_id}/adjust            → { delta, note }  # admin only
GET  /restrictions?user_id=&active_only=1    → list
POST /restrictions                           → create (manual)
DELETE /restrictions/{id}                    → revoke
GET  /linkage/{user_id}                      → cluster peers (+strength)

DTO sketch
Reputation = { score: number; band: 'good'|'neutral'|'watch'|'risk'|'bad'; last_event_at: string };
Restriction = { id: string; scope: string; mode: 'cooldown'|'shadow_restrict'|'captcha'|'hard_block'; reason: string; expires_at: string|null };
```

## 10) Observability

Metrics:

- abuse_velocity_trips_total{surface}
- restrictions_active_gauge{mode,scope}
- reputation_band_gauge{band}
- honey_trips_total
- shadow_writes_total{surface}
- captcha_required_total

Logs:

Structured JSON on every enforcement (user_id, surface, mode, ttl, risk, ip_label, device_users).

## 11) Security & Privacy

Device fingerprint is a salted hash; salt rotated monthly → store the salt id on device row.

IP reputation stored at /24 granularity for IPv4 when rendering staff UI; exact IP shown only to admins.

Linkage table holds coarse clusters; removal on user deletion.

Honey endpoints gated so they cannot be discovered by normal UI (nonce per session).

## 12) Failure Modes

Redis unavailable → fall back to conservative limits (deny on unknown after N attempts), log; write through to DB ledger for long-TTL restrictions.

Clock skew → rely on Redis TTLs; do not trust client time.

Excessive false positives → staff can adjust score or revoke restrictions; decay job runs hourly.

## 13) Background Jobs

- rep_decay.py — applies decay & band transitions.
- ip_enrichment.py — resolves ASN/category for new IPs (max 1/day per IP).
- linkage_rollup.py — updates clusters & strengths.
- restrictions_gc.py — purges expired ledger entries.

## 14) Config (YAML)

Thresholds per surface, band multipliers, TTLs for escalations, honey enable flags, captcha provider keys, IP reputation source toggles.

## 15) Deliverables

Migrations, gate middleware v2, reputation/event services, jobs, staff/self APIs, Prom metrics.
