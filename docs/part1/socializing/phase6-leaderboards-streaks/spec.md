# Phase 6 — Leaderboards & Streaks / spec.md

## 0) Directory (adds)
backend/
  app/
    api/leaderboards.py
    domain/leaderboards/
      __init__.py
      models.py            # scores, streaks, badges, snapshots
      schemas.py
      service.py           # scoring, rank calc, snapshots, badge engine
      accrual.py           # stream consumers -> accumulators (Redis -> PG)
      policy.py            # anti-gaming caps, time windows
      jobs.py              # periodic recompute/snapshot tasks
      outbox.py            # metrics/stream append
frontend/
  app/(leaderboards)/
    page.tsx
  components/
    LeaderboardTable.tsx
    StreakBadge.tsx
  lib/leaderboards.ts

## 1) Inputs (existing Streams from previous phases)
Redis Streams (already defined earlier phases):
- `x:invites.events`           # event: sent/accepted/declined/cancelled
- `x:friendships.events`       # event: accepted/blocked/unblocked
- `x:chat.events`              # event: msg:new (convo_id, from, to)
- `x:roomchat.events`          # event: msg:new (room_id, user_id)
- `x:rooms.events`             # event: created/join/leave/mute/kick/role
- `x:activities.events`        # event: created/started/ended (kind, winner?)
- `x:presence.heartbeats`      # heartbeats (to mark daily activity)

accrual.py reads these continuously and updates daily accumulators in Redis/PG.

## 2) Redis (ephemeral accumulators + leaderboards)

### Keys
- Per-user daily counters (expire +48h):
  `lb:day:{YYYYMMDD}:user:{user_id}` -> HSET {
    "invites_accepted", "friends_new", "dm_sent", "room_sent",
    "acts_played", "acts_won", "rooms_joined", "rooms_created",
    "uniq_senders", "uniq_invite_accept_from", "touched" (0/1)
  }
- Distinct trackers (expire EOD+48h):
  `lb:day:{d}:uniq_senders:{user_id}` -> SET of user_ids
  `lb:day:{d}:uniq_accept_from:{user_id}` -> SET of user_ids
- Leaderboard ZSETs (rolling snapshots computed by jobs):
  `lb:z:{scope}:{period}:{campus_id}:{YYYYMMDD}` -> ZADD user_id score
   where scope ∈ {social, popularity, engagement, overall}
         period ∈ {daily, weekly, monthly}
- Streak key:
  `streak:{user_id}` -> H{ "current", "best", "last_active_ymd" }

### TTLs
- Per-day hashes/sets: expire after 48h
- ZSET snapshots: keep 30 days (daily), 12 weeks (weekly), 6 months (monthly)

## 3) PostgreSQL 16 — persisted snapshots & badges


create table if not exists lb_daily (
ymd int not null, -- e.g., 20251024
campus_id uuid not null,
user_id uuid not null,
social numeric not null,
engagement numeric not null,
popularity numeric not null,
overall numeric not null,
rank_overall int, -- materialized at snapshot time
created_at timestamptz not null default now(),
primary key (ymd, campus_id, user_id)
);

create table if not exists streaks (
user_id uuid primary key,
current int not null default 0,
best int not null default 0,
last_active_ymd int not null default 0,
updated_at timestamptz not null default now()
);

create table if not exists badges (
id uuid primary key,
user_id uuid not null,
kind text not null check (kind in ('daily_top10','weekly_top10','streak_30','social_butterfly')),
earned_ymd int not null,
meta jsonb not null default '{}',
created_at timestamptz not null default now()
);
create index if not exists idx_badges_user on badges(user_id);


## 4) Scoring (MVP weights and caps)

Policy constants (policy.py):


W_INVITE_ACCEPT = 3.0
W_FRIEND_NEW = 5.0
W_DM_SENT = 0.3 (cap 60/day)
W_ROOM_SENT = 0.15 (cap 80/day)

W_ACT_PLAYED = 2.0
W_ACT_WON = 3.0
W_ROOM_JOIN = 1.0 (cap 6/day)
W_ROOM_CREATE = 2.0 (cap 2/day)

W_POP_UNIQ_SENDER = 1.0 (cap 20/day)
W_POP_UNIQ_INVITE_FROM = 2.0 (cap 10/day)

STREAK_MULT_MIN = 1.00
STREAK_MULT_MAX = 1.50
STREAK_AT_30 = 1.50 # linear 1.00→1.50 across 1..30


Daily pillar formulas (accrual → score):


social = 3invites_accepted + 5friends_new + 0.3min(dm_sent,60) + 0.15min(room_sent,80)

engagement = 2acts_played + 3acts_won + 1min(rooms_joined,6) + 2min(rooms_created,2)

popularity = 1min(uniq_senders,20) + 2min(uniq_invite_accept_from,10)

overall_raw = social + engagement + popularity
overall = overall_raw * streak_multiplier(current_streak_days)


Streak multiplier:


def streak_multiplier(d):
    if d <= 1:
        return STREAK_MULT_MIN
    if d >= 30:
        return STREAK_MULT_MAX
    return STREAK_MULT_MIN + (STREAK_MULT_MAX - STREAK_MULT_MIN) * (d - 1) / 29


## 5) Accrual (stream → daily counters)

accrual.py consumers (pseudocode):


on invites.events:
    if event == 'accepted':
        HINCRBY lb:day:{d}:user:{from} invites_accepted 1
        SADD lb:day:{d}:uniq_accept_from:{to} {from}
        HSET lb:day:{d}:user:{from} touched 1
        HSET lb:day:{d}:user:{to} touched 1

on friendships.events:
    if event == 'accepted':
        HINCRBY lb:day:{d}:user:{user_a} friends_new 1
        HINCRBY lb:day:{d}:user:{user_b} friends_new 1
        HSET touched 1 for both

on chat.events (msg:new):
    HINCRBYFLOAT lb:day:{d}:user:{from} dm_sent 1
    SADD lb:day:{d}:uniq_senders:{to} {from}
    HSET touched 1 for {from, to}

on roomchat.events (msg:new):
    HINCRBYFLOAT lb:day:{d}:user:{user_id} room_sent 1
    HSET touched 1 for user

on rooms.events:
    if event == 'created': HINCRBY lb:day:{d}:user:{user_id} rooms_created 1
    if event == 'join': HINCRBY lb:day:{d}:user:{user_id} rooms_joined 1
    HSET touched 1

on activities.events:
    if event == 'ended':
        HINCRBY lb:day:{d}:user:{a} acts_played 1
        HINCRBY lb:day:{d}:user:{b} acts_played 1
        if meta.winner == a: HINCRBY lb:day:{d}:user:{a} acts_won 1
        if meta.winner == b: HINCRBY lb:day:{d}:user:{b} acts_won 1
        HSET touched 1 for both


Campus resolution: join with `users.campus_id` (cache in Redis `user:campus:{user_id}` updated by backend when profile changes) for leaderboard bucketing.

## 6) Streak updates

Definition: a user **is active on day d** if their daily hash `touched == 1` or they sent a heartbeat.

End-of-day job:


for each user with touched==1 on day d:
    row = SELECT FROM streaks WHERE user_id
    if row.last_active_ymd == d-1:
        current = row.current + 1
    else:
        current = 1
    best = max(row.best, current)
    UPSERT streaks(user_id) SET current, best, last_active_ymd=d


Missed-day handling: if `last_active_ymd < d-1` and no touch on d, streak stays but multiplier uses current (which may reset next time they touch).

## 7) Snapshot + Rank (daily/weekly/monthly)

jobs.py (scheduled, e.g., every 5 min for provisional ZSET; final snapshot at 00:05 local campus time):


Compute day d provisional:

for each campus_id:
    users = scan keys lb:day:{d}:user:*
    for u in users:
        counters = HGETALL(...)
        s = score(counters)
        ZADD lb:z:social:daily:{campus_id}:{d} s.social u
        ZADD lb:z:engagement:daily:{campus_id}:{d} s.engagement u
        ZADD lb:z:popularity:daily:{campus_id}:{d} s.popularity u
        ZADD lb:z:overall:daily:{campus_id}:{d} s.overall u

Finalize daily to PG:

select top N (e.g., all or 1000) from each ZSET; write lb_daily rows with rank.
Also rollup weekly/monthly from last 7/30 day ZSETs:
    weekly_overall = sum(overall of last 7 d); monthly = sum(last 30 d)
Maintain corresponding ZSETs lb:z:overall:weekly:{campus_id}:{d} etc.


## 8) Badges engine

When finalizing daily:


if user in top 10 overall daily -> insert badge(kind='daily_top10', earned_ymd=d)
weekly top 10 -> during weekly finalize
if streaks.current >= 30 and no row yet -> insert badge 'streak_30'
if sum(distinct peers over last 7 days) >= 15 -> badge 'social_butterfly'


## 9) API (FastAPI)

GET `/leaderboards/{scope}` with query:
- `scope` ∈ `overall|social|engagement|popularity`
- `period` ∈ `daily|weekly|monthly` (default daily)
- `campus_id` (required)
- `ymd` optional (default today)
Returns: `[ { rank, user_id, score, deltas? } ]`

GET `/leaderboards/me/summary` → my current ranks/scores across scopes (today) + streaks + badges.

GET `/leaderboards/streaks/{user_id}` → current, best, last_active_ymd.

## 10) Schemas (Pydantic)


LeaderboardRow { rank:int, user_id:UUID, score:float }
LeaderboardResponse { scope:str, period:str, ymd:int, campus_id:UUID, items: LeaderboardRow[] }

MySummary {
    ymd:int, campus_id:UUID,
    ranks: { [scope:str]: int | null },
    scores:{ [scope:str]: float | null },
    streak:{ current:int, best:int, last_active_ymd:int },
    badges: Array<{ kind:string, earned_ymd:int }>
}


## 11) Anti-gaming (policy)
- Cap counters as specified.
- Ignore bursts exceeding **messages/sec threshold (5 rps)** per user for >10s (use sliding window in Redis to set a `muted_for_lb` flag for that interval).
- Only count **distinct senders** and **distinct accepted-invite senders** toward popularity.
- Room create capped to 2/day to avoid spam rooms.

## 12) Observability
- Counters:
  - `lb_events_processed_total{stream}`
  - `lb_snapshots_total{period,scope}`
  - `lb_badges_awarded_total{kind}`
- Gauges:
  - `lb_backlog_lag_seconds{stream}`
- Histograms:
  - `lb_compute_seconds{period}`

## 13) Frontend

- `/leaderboards` page:
  - Tabs: Daily/Weekly/Monthly; Scopes: Overall/Social/Engagement/Popularity
  - Campus picker (default from profile)
  - Table with rank, avatar, handle, score; my row highlighted
  - Side card: StreakBadge (current/best), my badges
