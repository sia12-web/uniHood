# test_plan.md — Communities Phase 3: Events & RSVPs

## 0) Scope
Unit, integration, and end-to-end coverage for events, venues, RSVPs, capacity/waitlist logic, reminders, ICS export, socket emissions, and indexing hooks.

## 1) Unit
- **Validation**
  - `end_at > start_at`; `duration ≤ 14d`; all-day normalization.
  - RRULE accepts simple patterns; rejects unsupported ones.
- **RSVP transitions**
  - going→declined frees capacity and triggers promotion.
  - waitlist promotion honours FIFO ordering.
  - interested neither consumes nor frees capacity.
  - guests counted toward capacity when allowed.
- **Counters**
  - Monotonic non-negative; waitlisted decrements on promotion.
- **ICS**
  - Correct timezone conversion; stable UID; escape SUMMARY/LOCATION.

## 2) Integration (API)
- **Create event**
  - Moderator can create; visibility enforced; counters start at zeroes.
- **List events**
  - Upcoming default; keyset cursors stable across pages.
- **Edit event**
  - Capacity increase promotes waitlisted attendees; decrease blocked when `< going`.
- **RSVP**
  - `going` when capacity available; waitlisted when full; decline moves going→declined and promotes first waitlisted entry.
  - guests validated; `allow_guests=false` rejects guests > 0.
- **ICS**
  - GET returns `text/calendar`; payload matches stored data.
- **Reminders**
  - Preview returns correct schedule; worker emits T-24h and T-1h reminders; deduped via Redis keys.

## 3) Workers
- **Waitlist promotion**
  - On decline/capacity change, promotes exactly required count.
  - Idempotent under repeated runs.
- **Reminders loop**
  - Uses `SETNX`; no duplicates; respects deleted/disabled events.

## 4) Streams & sockets (mocked)
- Emits `event.created` on create; `rsvp.promoted` with payload.
- Ordering by stream ID; no duplicate emissions after restart.

## 5) OpenSearch (mock)
- Outbox rows captured for `event` and `rsvp` changes.
- Event doc toggles `deleted=true` on soft delete.
- Going count updated from counters data.

## 6) Security
- Private/secret visibility: non-members cannot view/list/join.
- Edits by non-moderators → 403.
- Past events: editing start/end after event start → 403 unless moderator.

## 7) Performance
- Create event < 100 ms.
- RSVP throughput maintains capacity invariant (target 50 rps synthetic).
- Waitlist promotion for 1k waitlisted executes < 2 s.

## 8) E2E happy path
1. Admin creates event (`capacity=2`).
2. Users A and B RSVP `going` (count=2). User C gets waitlisted.
3. User B declines → C promoted; sockets emit `rsvp.promoted`.
4. 24h before start → reminders to A and C.
5. Delete event → sockets emit `event.deleted`; search doc shows `deleted=true`.

## 9) Coverage targets
- ≥ 85% for services/workers.
- ≥ 80% for API modules.
- Testcontainers: Postgres 16, Redis 7, OpenSearch mock.
