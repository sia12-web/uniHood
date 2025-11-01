# spec.md — Communities · Backend Phase 2 — Feeds & Ranking

## 0) Goals / Non-Goals
- Goals: user feed, group feed, ranking v1, cursor pagination, background rebuild jobs, Redis Streams fan-in, metrics.  
- Non-Goals: personalization (Phase 2.5+), recommendation engine, moderation filtering (Phase 4).

## 1) Data Model

### 1.1 Tables
```sql
CREATE TABLE feed_entry (
	id BIGSERIAL PRIMARY KEY,
	owner_id UUID NOT NULL,         -- user owning this feed row
	post_id UUID NOT NULL,          -- FK post.id
	group_id UUID NOT NULL,         -- FK group.id
	rank_score DOUBLE PRECISION NOT NULL,
	created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
	inserted_at TIMESTAMPTZ NOT NULL DEFAULT now(),
	UNIQUE(owner_id, post_id)
);
CREATE INDEX idx_feed_owner_rank ON feed_entry(owner_id, rank_score DESC, inserted_at DESC);

CREATE TABLE feed_offset_state (
	owner_id UUID PRIMARY KEY,
	last_posted_at TIMESTAMPTZ,
	last_id BIGINT
);
```

## 1.2 Derived data
rank_score = weighted sum:

```
rank = w1*time_decay + w2*engagement + w3*pin_boost
where:
	time_decay = exp(-Δt / 6h)
	engagement = log(1 + views + 3*reactions + 5*comments)
	pin_boost = 1.5 if post.is_pinned else 1
```

`feed_entry` is append-only; cleanup via periodic truncation (keep N days).

## 2) Feed Types
| Feed Type | Source | Audience | Persistence |
|-----------|--------|----------|-------------|
| group_feed | posts in a specific group | group members | ephemeral + Redis |
| user_feed | aggregate of joined groups | cached in PostgreSQL feed_entry | persistent |

## 3) Fan-in / Fan-out Flow
- **Event Ingress** — from Phase 1 Redis Stream `comm:post`
	- `event="created"` triggers fan-out.
- **Resolver Service**
	- fetch group members (`group_member.user_id`) → batch per 500.
- **Feed Writer**
	- write `feed_entry(owner_id, post_id, rank_score)`
	- idempotent: `ON CONFLICT DO NOTHING`.
	- push summary to Redis Sorted Set (`feed:{user}`) with `score=rank_score`.
	- TTL / Pruning — keep last `N = 5000` entries per user.

## 4) API Endpoints
```
GET  /feeds/user
GET  /feeds/group/{group_id}
POST /feeds/rebuild   (admin/debug)
```

### 4.1 GET /feeds/user
- Auth required.
- Query: `?after=cursor&limit=20`.
- If Redis Sorted Set `feed:{uid}` exists → return top `limit` elements.
- Fallback to PostgreSQL `feed_entry` ordered by `rank_score DESC`.

### 4.2 GET /feeds/group/{gid}`
- Public if `group.visibility=public`, else membership check.
- Query post table directly, ordered by rank_score computed on-the-fly.

### 4.3 POST /feeds/rebuild
- Admin-only.
- Pushes job to Redis Queue `feed:rebuild`.

## 5) Background Jobs

### 5.1 Fan-out Worker
```python
while True:
		msg = redis.xread({"comm:post": "$"}, block=5000, count=100)
		for post in msg:
				members = db.fetch("SELECT user_id FROM group_member WHERE group_id=%s AND is_banned=FALSE", [post.group_id])
				rank = compute_rank(post)
				pipe = redis.pipeline()
				for m in members:
						pipe.zadd(f"feed:{m.user_id}", {post.id: rank})
				pipe.execute()
				bulk_insert_feed_entries(members, post.id, post.group_id, rank)
```

### 5.2 Rank Updater
- Triggered hourly cron.
- Re-evaluate `rank_score` for recent posts (`< 24h`).
- `UPDATE feed_entry SET rank_score=new_rank WHERE post_id IN (...)`.

### 5.3 Feed Rebuilder
- For user feed rebuild (admin / catch-up).
- Steps:
	- Fetch `group_ids` joined by user.
	- Pull latest posts from each group (≤ 500).
	- Recompute rank & bulk insert.

## 6) Cache & Invalidation
- Redis ZSET `feed:{user}` with max length 5000 (approx 1 month).
- Invalidate on post delete → remove from all ZSETs via `ZREM` fan-out (batch script).
- Soft-delete in Postgres `feed_entry` marked `deleted=true`.

## 7) Pagination Cursor Encoding
```python
def encode_cursor(rank_score, post_id):
		return base64.b64encode(f"{rank_score}:{post_id}".encode()).decode()

def decode_cursor(cursor):
		score, pid = base64.b64decode(cursor).decode().split(":")
		return float(score), UUID(pid)
```

## 8) Metrics / Observability
| Metric | Description |
|--------|-------------|
| `feed_fanout_events_total` | count of new post events processed |
| `feed_entries_written_total` | rows inserted into `feed_entry` |
| `feed_rank_recompute_duration_seconds` | duration histogram |
| `feed_redis_zadd_failures_total` | Redis write errors |

## 9) Pseudocode — Compute Rank
```python
def compute_rank(post):
		age_hours = (now() - post.created_at).total_seconds() / 3600
		time_decay = math.exp(-age_hours / 6)
		engagement = math.log1p(post.reactions_count + 3*post.comments_count)
		pin_boost = 1.5 if post.is_pinned else 1
		return round((time_decay + 0.05 * engagement) * pin_boost, 6)
```

## 10) Job Scheduling
- Use APScheduler for hourly rank updates.
- Use RQ or FastStream worker for Redis Streams fan-out.
- Max concurrency = 10 workers; rate-limit 500 posts/s.

## 11) Error Handling
- Missing group/post → skip and log.
- Redis timeout → retry 3x then DLQ `feed_dlq`.
- Postgres constraint violation on duplicate `feed_entry` → ignore (idempotent).

## 12) Security / Privacy
- Feed entries respect group visibility at time of creation.
- On group visibility change → rebuild feeds.
- No exposure of secret group posts to non-members.

## 13) Schema Migration Order
```
0006_feed_entry.sql
0007_feed_offset_state.sql
```

## 14) Directory Tree
```
/parts/03-communities/backend/phase-2-feeds-ranking/
	spec.md
	test_plan.md
	migrations/
		0006_feed_entry.sql
		0007_feed_offset_state.sql
	workers/
		fanout_worker.py
		rank_updater.py
		feed_rebuilder.py
	services/
		ranker.py
		feed_writer.py
		feed_query.py
	infra/
		redis.py
		scheduler.py
```
