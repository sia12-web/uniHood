# Phase 7 — Search & Discovery / spec.md

## Goal

Provide **fast, privacy-safe user/room search** and **discovery feeds** (people/rooms) scoped by campus:
- **User search** by handle/display name with ranking, fuzzy tolerance, and privacy filters.
- **Discovery – People**: friend-of-friend, mutuals, active recently, nearby (optional blend).
- **Discovery – Rooms**: trending (message velocity), member overlap with me.
- **Backend-first** using **PostgreSQL trigram + ILIKE** now; **OpenSearch** behind a feature flag for later.

## 0) Directory (adds)
backend/
	app/
		api/search.py
		domain/search/
			__init__.py
			schemas.py
			service.py          # ranking, filters, queries
			policy.py           # rate limits, privacy guards
			indexing.py         # (optional) OpenSearch adapter; no-op by default
			ranking.py          # score functions
frontend/
	app/(search)/
		page.tsx              # unified search (users/rooms tabs)
	components/
		SearchBar.tsx
		UserResultCard.tsx
		RoomResultCard.tsx
	lib/search.ts

## 1) Data (PostgreSQL 16) — indices

-- Users table assumed:
-- users(id uuid pk, handle text, display_name text, avatar_url text, campus_id uuid, privacy jsonb)
-- Friendships table from Phase 2; rooms + room_members from Phase 4.

-- Enable pg_trgm for fuzzy/prefix ranking
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- Trigram indexes (GIN) for search fields
CREATE INDEX IF NOT EXISTS idx_users_trgm_handle ON users USING gin (handle gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_users_trgm_display ON users USING gin (display_name gin_trgm_ops);

-- Filter helpers
CREATE INDEX IF NOT EXISTS idx_users_campus ON users(campus_id);

-- Rooms
-- rooms(id uuid pk, campus_id uuid, name text, preset text, visibility text)
CREATE INDEX IF NOT EXISTS idx_rooms_trgm_name ON rooms USING gin (name gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_rooms_campus ON rooms(campus_id);

-- Metrics view (materialized or live) for trending rooms (Phase 4 streams can feed this later)
-- MVP: compute on the fly from room_messages last 24h count.

2) Redis (rate limits + optional autocomplete)

Keys:

rl:search:{user_id}:{yyyyMMddHHmm} ≤ 60/min

(Optional) Autocomplete SUGGEST cache (if enabled later):

sug:users:{campus_id} ZSET of lowercase tokens (not required in MVP)

3) Privacy Rules (policy)

Respect users.privacy.visibility:

"none" → user non-searchable except exact handle by accepted friends (status=accepted).

"friends" → visible only to accepted friends and mutuals via discover (if policy allows), not in open search.

"everyone" → searchable.

ghost_mode=true → not returned in discovery feeds; can still be returned by exact search if already friends.

Block lists (Phase 2): exclude users I blocked or who blocked me.

Rooms:

Only rooms in my campus.

visibility='link' rooms are searchable by name, private rooms excluded.

4) API (FastAPI)

GET /search/users
GET /discover/people
GET /discover/rooms

Query schemas (Pydantic)

SearchUsersQuery:

{
	q: string,                  # user typed query
	campus_id?: UUID,           # default from my profile
	limit?: int (default 20, max 50),
	cursor?: string             # opaque (last_score:last_id)
}


DiscoverPeopleQuery:

{
	campus_id?: UUID,
	limit?: int (default 20, max 50),
	cursor?: string
}


DiscoverRoomsQuery:

{
	campus_id?: UUID,
	limit?: int (default 20, max 50),
	cursor?: string
}

Response DTOs

UserResult:

{
	user_id: UUID,
	handle: string,
	display_name: string,
	avatar_url?: string,
	is_friend: boolean,
	mutual_count: int,
	score: float                # server ranking score (opaque)
}


RoomResult:

{
	room_id: UUID,
	name: string,
	preset: "2-4"|"4-6"|"12+",
	members_count: int,
	msg_24h: int,               # messages in last 24h (trending proxy)
	score: float
}


ListResponse<T>:

{
	items: T[],
	cursor?: string
}

5) Core Algorithms (service.py)
5.1 Rate limit
assert_rl(user_id, key="search", per_min=60)

5.2 Campus resolution
campus_id = query.campus_id or current_user.campus_id

5.3 User search (PostgreSQL path)
function search_users(me, q, campus_id, limit, cursor):
	# Normalize query
	q_norm = trim(lower(q))
	if q_norm == "": return {items:[], cursor:null}

	# Ranking signals:
	#   s_text: max(similarity(handle, q), similarity(display_name, q))
	#   s_prefix: 1.0 if handle startswith q or display startswith q else 0
	#   s_friend: 0.25 boost if is_friend
	#   s_mutual: log1p(mutual_count)/4
	# final_score = 0.7*s_text + 0.2*s_prefix + 0.1*s_friend + 0.1*s_mutual (clamped 0..1.5)

	# Candidate set with filters:
	sql = """
	WITH me_friends AS (
		SELECT friend_id FROM friendships
		WHERE user_id = :me AND status='accepted'
	),
	mutuals AS (
		SELECT u.id AS uid, COUNT(*)::int AS mutual_count
		FROM friendships f
		JOIN me_friends mf ON f.friend_id = mf.friend_id
		JOIN users u ON u.id = f.user_id
		WHERE f.status='accepted' AND u.campus_id=:campus
		GROUP BY u.id
	),
	base AS (
		SELECT u.id, u.handle, u.display_name, u.avatar_url,
					 (similarity(u.handle, :q) + similarity(u.display_name, :q)) AS s_text_raw,
					 (CASE WHEN lower(u.handle) LIKE :qprefix OR lower(u.display_name) LIKE :qprefix THEN 1.0 ELSE 0 END) AS s_prefix,
					 (CASE WHEN EXISTS (SELECT 1 FROM friendships f WHERE f.user_id=:me AND f.friend_id=u.id AND f.status='accepted') THEN 1 ELSE 0 END) AS is_friend,
					 coalesce(m.mutual_count,0) AS mutual_count
		FROM users u
		LEFT JOIN mutuals m ON m.uid = u.id
		WHERE u.campus_id=:campus
			AND u.id <> :me
			AND (u.privacy->>'visibility' IS NULL OR u.privacy->>'visibility' IN ('everyone','friends'))
			AND (u.privacy->>'ghost_mode' IS NULL OR (u.privacy->>'ghost_mode')::boolean = false)
			AND (
				u.handle ILIKE :like OR u.display_name ILIKE :like
				OR similarity(u.handle, :q) > 0.2 OR similarity(u.display_name, :q) > 0.2
			)
	)
	SELECT id, handle, display_name, avatar_url, is_friend, mutual_count,
				 LEAST(1.5, 0.7*GREATEST(similarity(handle,:q), similarity(display_name,:q))
										+ 0.2*s_prefix + 0.1*(is_friend::int)
										+ 0.1*ln(1+mutual_count)) AS score
	FROM base
	-- Privacy refinement: if visibility='friends' require is_friend=1
	-- This refinement can be enforced in WHERE via join on users.privacy.
	ORDER BY score DESC, id
	LIMIT :limit_plus
	"""

	# Apply block filters post-query (exclude blocked relationships).
	# Cursor: decode(last_score,last_id) and filter out <= last_score with id<=last_id

5.4 Discover – People
function discover_people(me, campus, limit, cursor):
	# Signals:
	#  s_mutual = ln(1+mutual_count)
	#  s_recent = recency_weight(last_seen_ts from Redis presence hash, 0..0.4)
	#  s_nearby  = optional small boost if within 50m bucket recently (Phase 1), 0..0.2
	#  s_friend  = hard exclude: not already friend; exclude blocked
	# final = 0.6*s_mutual + 0.3*s_recent + 0.1*s_nearby

	# Candidate pool: same campus, privacy visibility in ('everyone','friends'), not ghost, not me, not friend
	# Compute mutual_count via SQL; join recent presence timestamps via Redis pipeline (optional)
	# Order by final desc; paginate with cursor

5.5 Discover – Rooms
function discover_rooms(me, campus, limit, cursor):
	# Signals:
	#  s_trend = ln(1 + messages_in_last_24h(room_id))           -- from room_messages
	#  s_size  = ln(1 + members_count)
	#  s_aff   = ln(1 + member_overlap_with_me) * 0.5             -- overlap = |room_members ∩ my_friends|
	# final = 0.6*s_trend + 0.3*s_size + 0.1*s_aff

	SELECT r.id, r.name, r.preset,
				 (SELECT COUNT(*) FROM room_members m WHERE m.room_id=r.id) AS members_count,
				 (SELECT COUNT(*) FROM room_messages mm WHERE mm.room_id=r.id AND mm.created_at >= now()-interval '24 hours') AS msg_24h,
				 computed_score AS score
	FROM rooms r
	WHERE r.campus_id=:campus AND r.visibility='link'
	ORDER BY score DESC, r.id
	LIMIT :limit_plus

5.6 Cursoring (stable)

Encode: base64(f"{last_score:.6f}:{last_id}")

When applying cursor: skip rows where (score < last_score) OR (score == last_score AND id <= last_id).

6) OpenSearch (optional adapter) — indexing.py

Feature flag SEARCH_BACKEND=os enables:

User index {id, campus_id, handle, display_name, visibility, ghost_mode, friend_ids(optional)}

Analyzer: edge_ngram for prefix, fuzziness=1 for len≤5, AUTO otherwise.

Ranking: scripted score mixing text score + boosts from friend/mutual counts (if stored).

MVP ships with Postgres path; adapter returns NotImplemented unless enabled.
7) Observability

Counters:

search_user_queries_total

discover_people_queries_total

discover_rooms_queries_total

Histograms:

search_latency_seconds{type}

Logs: sampled query text (lowercased, truncated) + result counts; PII redacted.

8) Frontend Algorithms
8.1 Search page

Debounced input (250ms); on change → GET /search/users?q=...

Tabs: Users / Rooms; for Rooms, call /discover/rooms with campus picker.

Infinite scroll using cursor until depleted.

Cards show: avatar, handle, display name, mutuals, and “Invite” or “Chat” CTA depending on friendship.

8.2 Empty/Edge states

If q length < 2 → show Discover People (seeded) instead of empty.

On 429 (rate limit) → toast and backoff for 10s.

9) Constants

SEARCH_PER_MINUTE = 60

MIN_QUERY_LEN = 2

PAGE_DEFAULT = 20, PAGE_MAX = 50


---

