# Test Plan — Moderation · Backend Phase 5 — Trust & Rate-Limit v2 + Reputation Signals

## 0) Scope
Covers velocity detection, restrictions ledger, reputation math/decay, device/IP signals, evasion detection, APIs, and observability.

## 1) Unit
- **Reputation math**: risk composition, band thresholds, decay function edge cases.
- **Velocity**: windows trip at exact thresholds; band multipliers applied.
- **Enforcement**: cooldown/ shadow / captcha selection logic; TTL correctness.
- **Honey**: calling hidden endpoint triggers restriction + event.
- **Link cooloff**: external links stripped when active.

## 2) Integration
- **Write gate**
  - Post spam bursts → 429 `cooldown_active` with `retry_after` > 0.
  - Repeat bursts escalate to 60-min cooldown, then `shadow_restrict`.
  - Shadowed posts are visible to author but 404 to others.
- **Device/IP**
  - Three accounts on same fp_hash within 24h → auto watch band; invites rate limit lowered.
  - TOR/DC IP raises ip.score and enforces captcha on write.
- **Reputation events**
  - Policy `remove` from Phase 4 adds +15 risk; band step triggers shadow.
  - Accepted invite and age reduce risk (downward deltas applied with caps).
- **APIs**
  - `GET /restrictions/me` lists current user restrictions with expiries.
  - Staff can `POST /restrictions` (manual), `DELETE` revoke; `GET /reputation/:id` shows last 20 events.
  - `GET /linkage/:id` returns cluster peers with strengths.
- **Jobs**
  - `rep_decay` lowers scores without new negatives; bands transition accordingly.

## 3) E2E
1. New user on VPN spams 12 comments/min → cooldown 15m → resumes spam → cooldown 60m → shadow restrict 24h; reputation band becomes `risk`.  
2. Same device creates two more accounts; linkage clusters them; new account starts in `watch` band; invite thresholds tighter.  
3. User behaves well for 2 days; decay moves band to `neutral`; restrictions expire; posting normal.  
4. Honey action trip from scripted client → captcha_required + shadow; staff reviews and revokes.

## 4) Security
- No device PII; only salted hashes; salt rotation leaves linkage usable via salt_id mapping.
- Staff RBAC: only admins can see exact IP; moderators see ASN/category only.
- Honey endpoints not present in OpenAPI; guarded by per-session nonce.

## 5) Performance
- Gate checks < 2 ms (Redis hot path).
- Reputation updates < 10 ms (single row + insert event).
- Jobs: decay sweep 100k users < 1 min with batching.

## 6) Observability
- Metrics emitted for each enforcement; gauges match ledger counts.
- Alert on `honey_trips_total` spike or `restrictions_active_gauge{mode='hard_block'}` > threshold.

## 7) Coverage Targets
- ≥ 85% for reputation math, velocity, and gate middleware.
- ≥ 80% for APIs and jobs.
