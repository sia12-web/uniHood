# spec.md — Communities Phase 3: Events & RSVPs

## 0) Goals / Non-goals
- Goals: `Event`, `EventVenue`, and `RSVP` models; CRUD; capacity handling, waitlist promotion, reminders; ICS export; Socket/OpenSearch integration; keyset pagination.
- Non-goals: recommendation/ranking (Phase 4), ticketing/payments, complex recurrence support (only simple RRULE strings).

## 1) Data model (PostgreSQL 16)
- Timestamps stored in UTC; API accepts/returns ISO-8601. `tz` string preserved for venue display fidelity.
- Soft delete via `deleted_at`. IDs are UUID v4.

```
CREATE TABLE event_venue (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  campus_id UUID NULL,
  name TEXT NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('physical','virtual')),
  address TEXT NULL,
  lat DOUBLE PRECISION NULL,
  lon DOUBLE PRECISION NULL,
  url TEXT NULL,
  tz TEXT NOT NULL DEFAULT 'UTC',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE event_entity (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  group_id UUID NOT NULL REFERENCES group_entity(id) ON DELETE CASCADE,
  campus_id UUID NULL,
  title TEXT NOT NULL CHECK (char_length(title) BETWEEN 3 AND 120),
  description TEXT NOT NULL DEFAULT '',
  venue_id UUID NULL REFERENCES event_venue(id),
  start_at TIMESTAMPTZ NOT NULL,
  end_at TIMESTAMPTZ NOT NULL,
  all_day BOOLEAN NOT NULL DEFAULT FALSE,
  capacity INT NULL CHECK (capacity IS NULL OR capacity >= 1),
  visibility TEXT NOT NULL CHECK (visibility IN ('public','private','secret')),
  rrule TEXT NULL,
  allow_guests BOOLEAN NOT NULL DEFAULT FALSE,
  created_by UUID NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at TIMESTAMPTZ NULL
);
CREATE INDEX idx_event_group_time ON event_entity(group_id, start_at) WHERE deleted_at IS NULL;
CREATE INDEX idx_event_campus_time ON event_entity(campus_id, start_at) WHERE deleted_at IS NULL;

CREATE TABLE event_rsvp (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  event_id UUID NOT NULL REFERENCES event_entity(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('going','waitlisted','declined','interested')),
  guests SMALLINT NOT NULL DEFAULT 0 CHECK (guests BETWEEN 0 AND 5),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(event_id, user_id)
);

CREATE TABLE event_counter (
  event_id UUID PRIMARY KEY REFERENCES event_entity(id) ON DELETE CASCADE,
  going INT NOT NULL DEFAULT 0,
  waitlisted INT NOT NULL DEFAULT 0,
  interested INT NOT NULL DEFAULT 0
);

-- Outbox for indexing/notifications (Phase 1 pattern reused)
-- Use outbox_event with aggregate_type 'event' | 'rsvp'
```

### 1.1 Invariants
- `end_at > start_at` unless all_day; if all_day normalize to `[start_day 00:00:00, start_day 23:59:59]` UTC.
- `capacity`: when not NULL, sum(going + guests) ≤ capacity. Waitlist ordered by `created_at`.
- Group visibility/membership governs event visibility.

## 2) Authorization
- Create/Update/Delete event: group owner/admin/moderator.
- RSVP: members per group visibility; public groups may allow non-members if configuration allows.
- View: public → anyone; private/secret → members only.
- Editing attendance (promote/demote): moderators and above.

## 3) API (FastAPI) — `/api/communities/v1`

```
POST   /groups/{group_id}/events
GET    /groups/{group_id}/events
GET    /events/{event_id}
PATCH  /events/{event_id}
DELETE /events/{event_id}

POST   /events/{event_id}/rsvps
PATCH  /events/{event_id}/rsvps/{user_id}
DELETE /events/{event_id}/rsvps/{user_id}

POST   /events/{event_id}/reminders/preview
GET    /events/{event_id}/ics
```

### 3.1 Request/response sketches

```
type EventIn = {
  title: string; description?: string; venue_id?: string | null;
  start_at: string; end_at: string; all_day?: boolean;
  capacity?: number | null; visibility: 'public' | 'private' | 'secret';
  rrule?: string | null; allow_guests?: boolean;
};

type Event = EventIn & {
  id: string; group_id: string; campus_id?: string | null;
  counters: { going: number; waitlisted: number; interested: number };
  created_at: string; updated_at: string; deleted_at?: string | null;
  role?: 'owner' | 'admin' | 'moderator' | 'member' | null;
};

type RSVPIn = { status: 'going' | 'declined' | 'interested'; guests?: number };

type RSVP = { id: string; event_id: string; user_id: string; status: string; guests: number; created_at: string; updated_at: string };
```

### 3.2 Listing & keyset pagination
- Default scope: upcoming (`start_at >= now()`). `?scope=past|all`.
- Cursor: base64 of `{start_at_iso,id}` using `(start_at,id)` ordering ASC.

## 4) RSVP logic (capacity + waitlist)

### 4.1 Transitions
- Caller can opt into `going`, `declined`, `interested`.
- System assigns `waitlisted` when capacity exceeded.

### 4.2 Pseudocode

```
def rsvp_upsert(event_id, user_id, status, guests=0):
    ev = repo.get_event_for_update(event_id)
    rsvp = repo.get_rsvp(event_id, user_id)
    if status in ('declined', 'interested'):
        repo.save_rsvp(event_id, user_id, status, guests=0)
        counters.adjust(ev.id, from_=rsvp, to=status)
        maybe_promote_waitlist(ev)
        outbox('rsvp', rsvp_id, 'updated', {...})
        return
    needed = 1 + guests
    going_count = counters.get_going(ev.id)
    if ev.capacity is None or going_count + needed <= ev.capacity:
        repo.save_rsvp(event_id, user_id, 'going', guests=guests)
        counters.adjust(ev.id, from_=rsvp, to='going', guests_delta=guests)
        outbox('rsvp', rsvp_id, 'updated', {...})
    else:
        repo.save_rsvp(event_id, user_id, 'waitlisted', guests=0)
        counters.adjust(ev.id, from_=rsvp, to='waitlisted')
        outbox('rsvp', rsvp_id, 'updated', {...})

def maybe_promote_waitlist(ev):
    if ev.capacity is None:
        return
    free = ev.capacity - counters.get_going(ev.id)
    if free <= 0:
        return
    wl = repo.waitlist_fifo(ev.id, limit=free)
    for r in wl:
        repo.update_rsvp_status(r.id, 'going')
        counters.bump(ev.id, 'going', +1)
        counters.bump(ev.id, 'waitlisted', -1)
        outbox('rsvp', r.id, 'promoted', {...})
        notify(r.user_id, 'rsvp.promoted', ev.id)
```

## 5) Reminders & schedules
- Default reminder schedule: T-24h, T-1h relative to `start_at`.
- Worker scans due reminders per minute.
- Deduplicate via Redis key `reminder:{event_id}:{user_id}:{offset}` with TTL.

```
def reminder_loop():
    while True:
        now_utc = utcnow()
        due = db.fetch("""
          SELECT er.user_id, e.id, e.start_at
          FROM event_entity e
          JOIN event_rsvp er ON er.event_id=e.id AND er.status='going'
          WHERE e.deleted_at IS NULL
            AND e.start_at BETWEEN now() AND now()+interval '48 hours'
        """)
        for row in due:
            for offset in (hours(24), hours(1)):
                ts = row.start_at - offset
                if is_due(now_utc, ts) and not redis.setnx(key(row, offset), 1, ex=7200):
                    continue
                notify(row.user_id, 'event.reminder', row.id, context={'offset': offset})
        sleep(30)
```

## 6) ICS export
- Single VEVENT (no RRULE expansion for MVP).
- Convert to venue timezone for DTSTART/DTEND.
- Response `Content-Type: text/calendar; charset=utf-8`.

```
def build_ics(event: Event) -> str:
    dtstart_local = to_tz(event.start_at, venue.tz)
    dtend_local = to_tz(event.end_at, venue.tz)
    uid = f"{event.id}@divan"
    return f"""BEGIN:VCALENDAR
VERSION:2.0
PRODID:-//Divan//Communities//EN
BEGIN:VEVENT
UID:{uid}
DTSTAMP:{utcnow():%Y%m%dT%H%M%SZ}
DTSTART;TZID={venue.tz}:{dtstart_local:%Y%m%dT%H%M%S}
DTEND;TZID={venue.tz}:{dtend_local:%Y%m%dT%H%M%S}
SUMMARY:{escape(event.title)}
DESCRIPTION:{escape(event.description)}
LOCATION:{escape(venue_str(venue))}
END:VEVENT
END:VCALENDAR
"""
```

## 7) OpenSearch indexing
- Indices: `events_v1`, `venues_v1`.
- Document shape:

```
{ "id": "...", "group_id": "...", "title": "...", "body": "...",
  "campus_id": "...", "start_at": "...", "end_at": "...", "all_day": false,
  "visibility": "public", "venue_kind": "physical|virtual", "venue_text": "...", "deleted": false }
```

- Outbox worker maps `event` and `rsvp` payloads for indexing. RSVP updates adjust going count.

## 8) Streams & sockets
- Redis Streams:
  - `comm:event`: created|updated|deleted
  - `comm:rsvp`: updated|promoted|declined
- Socket.IO namespaces:
  - `/groups/{group_id}/events` emits event.created|updated|deleted
  - `/events/{event_id}` emits rsvp.updated|promoted
- Ordering per event room uses stream IDs.

## 9) Validation & limits
- Event duration ≤ 14 days.
- Editing start/end after event start restricted to moderators.
- Guests allowed only when `allow_guests=true` and `guests ≤ 5`.
- Capacity cannot be reduced below current going count.

## 10) Errors
- 400 invalid dates/tz, 403 unauthorized, 404 not found/not visible, 409 capacity conflict, 422 unsupported RRULE.

## 11) Migrations & seeds
- SQL: `0008_event_venue.sql`, `0009_event_entity.sql`, `0010_event_rsvp_counters.sql`.
- Seeds: sample venues and 10 sample events within next 30 days.

## 12) Observability
- Metrics: `events_created_total`, `event_rsvps_updated_total`, `event_waitlist_promotions_total`, `event_reminders_sent_total`, `event_reminders_skipped_total`.
- Structured logs include event_id, group_id, user_id, stream_id.

## 13) FastAPI structure

```
app/communities/api/events.py
app/communities/api/rsvps.py
app/communities/domain/events_service.py
app/communities/domain/rsvp_service.py
app/communities/workers/reminders.py
app/communities/workers/waitlist_promoter.py
```
