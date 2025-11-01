
# Phase 1 — Proximity Core / spec.md

## 0) Directory Skeleton (respect repo structure)
backend/
	app/
		api/proximity.py
		domain/proximity/
			__init__.py
			models.py
			service.py
			privacy.py
			anti_spoof.py
			sockets.py
			schemas.py
		infra/
			redis.py
			postgres.py
			auth.py
			rate_limit.py
		settings.py
	tests/ (see test_plan.md)
frontend/
	app/(proximity)/
		page.tsx
		components/NearbyList.tsx
		lib/socket.ts
		lib/geo.ts
	__tests__/ (see test_plan.md)

## 1) Data Model (PostgreSQL 16) — persisted (simplified)
```
-- users (existing or placeholder)
users(id uuid PK, handle text unique, display_name text, avatar_url text, campus_id uuid, privacy jsonb default '{}')
-- friendships
friendships(user_id uuid, friend_id uuid, status text check in ('pending','accepted','blocked'),
						created_at timestamptz, updated_at timestamptz,
						primary key(user_id, friend_id))
-- campuses
campuses(id uuid pk, name text, lat double precision, lon double precision)
-- OPTIONAL venues (classroom/library/cafe) for context (future)
venues(id uuid pk, campus_id uuid, name text, lat double precision, lon double precision, radius_m int)
```

### Privacy settings JSON (users.privacy)
```
{
	"visibility": "everyone" | "friends" | "none",
	"blur_distance_m": 0 | 10 | 20 | 50 | 200,
	"ghost_mode": false
}
```

## 2) Redis Schema (ephemeral)
### Keys
- GEO index per campus:
	`geo:presence:{campus_id}` -> Redis GEO (lon,lat user_id)
- Presence hash per user:
	`presence:{user_id}` -> HSET {
			"lat", "lon", "accuracy_m", "ts", "device_id", "campus_id", "venue_id?"
	} EXPIRE 90s
- Online bit:
	`online:user:{user_id}` -> "1" EXPIRE 90s
- Rate limit buckets:
	`rl:hb:{user_id}:{yyyyMMddHHmm}` -> INCR/EXPIRE 60s
	`rl:nearby:{user_id}:{yyyyMMddHHmm}` -> INCR/EXPIRE 60s
- Temporary GEO result store per request (optional if using direct GEOSEARCH):
	`tmp:nearby:{req_id}` -> sorted set (distance as score) EXPIRE 5s
- Streams (audit/analytics):
	`x:presence.heartbeats`
	`x:proximity.queries`

### TTLs
- Presence: 90s
- Online flag: 90s
- tmp result: 5s
- Stream entries: capped by `XTRIM MAXLEN ~ 100000`

## 3) Socket.IO Namespacing
- Namespace: `/presence`
- Rooms:
	- `campus:{campus_id}`
	- `campus:{campus_id}:r:{10|20|50|200}`
	- Optional: `user:{user_id}` (direct pings)
- Events (server -> client):
	- `nearby:update` => { radius_m, added: UserLite[], removed: string[], updated: UserLite[] }
	- `presence:ack` => { ts }
- Events (client -> server):
	- `presence:heartbeat` => HeartbeatPayload
	- `nearby:subscribe` => { campus_id, radius_m }
	- `nearby:unsubscribe` => { campus_id, radius_m }

## 4) API (FastAPI)
- POST `/presence/heartbeat`
- GET  `/proximity/nearby`
- GET  `/presence/status/self`

### Schemas (Pydantic)
```
HeartbeatPayload:
{
	lat: float,
	lon: float,
	accuracy_m: int,        # required; reject if > 50m for 10/20m buckets
	campus_id: UUID,
	venue_id?: UUID | null,
	device_id: str,
	ts_client: int (ms epoch)
}
NearbyQuery:
{
	campus_id: UUID,
	radius_m: 10|20|50|200,
	cursor?: string,        # opaque; base64 of (last_user_id, last_distance_mm)
	limit?: int (default 50, max 200),
	filter?: "all"|"friends",
	include?: string[]      # ["profile","distance"]
}
UserLite:
{
	user_id: UUID,
	display_name: string,
	handle: string,
	avatar_url?: string,
	distance_m?: int,       # bucketed/blurred
	is_friend?: bool
}
```

## 5) Core Algorithms (pseudocode)

### 5.1 Heartbeat handling (POST /presence/heartbeat OR socket event)
```
function handle_heartbeat(auth_user, payload: HeartbeatPayload):
	assert rate_limit("hb", auth_user.id, per_minute=30) # 2s avg; server also dedup by device_id
	assert payload.accuracy_m <= max_allowed_accuracy(payload.radius_context?) default 50
	assert is_plausible_movement(auth_user.id, payload.lat, payload.lon, payload.ts_client)

	campus_id = payload.campus_id or users.campus_id
	now_ms = now()

	# Write presence

	GEOADD key=geo:presence:{campus_id} (lon=payload.lon, lat=payload.lat, member=auth_user.id)
	HSET key=presence:{auth_user.id} {
		"lat": payload.lat, "lon": payload.lon,
		"accuracy_m": payload.accuracy_m, "ts": now_ms,
		"device_id": payload.device_id, "campus_id": campus_id,
		"venue_id": payload.venue_id or ""
	}
	EXPIRE presence:{auth_user.id} 90
	SETEX online:user:{auth_user.id} 90 "1"

	# Stream for analytics

	XADD x:presence.heartbeats * user_id=auth_user.id campus_id=campus_id acc=payload.accuracy_m

	# Socket ACK and fanout (optional micro-diff)

	emit to room campus:{campus_id} => event "presence:ack" { ts: now_ms }
```

### 5.2 Movement plausibility check
```
function is_plausible_movement(user_id, lat, lon, ts_client):
	prev = HGETALL presence:{user_id}
	if not prev: return true
	dt_s = max(1, (now_ms - prev.ts)/1000)
	distance_m = haversine(prev.lat, prev.lon, lat, lon)
	speed_mps = distance_m / dt_s
	if speed_mps > 12: return false # ~43 km/h on foot/scooter cap

	also reject > 1km jump within 30s

	if distance_m > 1000 and dt_s < 30: return false
	return true
```

### 5.3 Nearby query (GET /proximity/nearby)
```
function get_nearby(auth_user, q: NearbyQuery):
	assert rate_limit("nearby", auth_user.id, per_minute=30)

	campus_id = q.campus_id or users.campus_id

	1) GEOSEARCH (distance ascending) limited to a reasonable cap (e.g., 1000)

	results = GEOSEARCH key=geo:presence:{campus_id}
	FROMlonlat(lon_user, lat_user=from presence or last heartbeat)
	BYRADIUS q.radius_m METERS WITHDIST ASC COUNT 1000

	2) Filter self-out and expired presences

	live = []
	for (member_id, dist_m) in results:
		if member_id == auth_user.id: continue
		if TTL presence:{member_id} <= 0: continue
		live.append((member_id, dist_m))

	3) Privacy & friendship filter
	Fetch privacy for candidates in batch from Postgres

	privacy_map = load_privacy(live.user_ids)
	friends_map = load_friendship_flags(auth_user.id, live.user_ids)
	blocks_map = load_blocks(auth_user.id, live.user_ids) # if modeled via friendships.status='blocked'

	filtered = []
	for uid, dist_m in live:
		if blocks_map[uid] == true: continue
		p = privacy_map[uid]
		if p.ghost_mode == true: continue
		if p.visibility == "none": continue
		if p.visibility == "friends" and not friends_map[uid]: continue
		filtered.append((uid, dist_m))

	4) Cursor pagination based on (distance, user_id)
	Sort already distance-asc; apply cursor if provided

	start_idx = 0
	if q.cursor:
		(last_uid, last_dist_mm) = decode(q.cursor)
		start_idx = first index where (dist1000 > last_dist_mm) OR (dist1000 == last_dist_mm and uid > last_uid)

	page = filtered[start_idx : start_idx + q.limit]

	5) Blur distance to the max(user_privacy.blur_distance_m, bucket(q.radius_m))
	Bucket function: 10->10, 20->20, 50->50, 200->200

	bucket = q.radius_m
	response = []
	profiles = load_user_lite(page.user_ids) # handle, name, avatar
	for uid, dist_m in page:
		blur = max(privacy_map[uid].blur_distance_m or 0, bucket)
		response.append({
			user_id: uid,
			display_name: profiles[uid].display_name,
			handle: profiles[uid].handle,
			avatar_url: profiles[uid].avatar_url,
			distance_m: round_up_to_bucket(dist_m, blur),
			is_friend: friends_map[uid] or false
		})

	6) Next cursor

	next_cursor = null
	if len(filtered) > start_idx + q.limit:
		(uid_last, dist_last) = page[-1]
		next_cursor = base64encode(f"{uid_last}:{int(dist_last*1000)}")

	7) Stream analytic

	XADD x:proximity.queries * user_id=auth_user.id campus_id=campus_id radius=q.radius_m count=len(response)

	return { items: response, cursor: next_cursor }
```

### 5.4 Socket subscription flow
```
client -> server: nearby:subscribe { campus_id, radius_m }
server:
	join socket into rooms: campus:{campus_id} and campus:{campus_id}:r:{radius_m}
	optionally run an immediate nearby query and emit 'nearby:update' with current items

On each accepted heartbeat that changes cell/bucket materially (distance > 5m or crossed bucket threshold):
	compute diffs for subscribers of that campus+radius
	server emits 'nearby:update' with added/removed/updated for minimal churn
```

## 6) Rate Limiting
- Heartbeat: ≤ 30/min/user (2s cadence). Reject with 429.
- Nearby queries: ≤ 30/min/user.
- Socket subscriptions: join/leave ≤ 6/min.

## 7) Auth & Security
- JWT (FastAPI dependency) → `auth_user.id`.
- Deny if campus mismatch unless user.campus_id == q.campus_id (role-based overrides later).
- Anti-spoof checks (speed, big jumps, accuracy threshold).
- All returns are bucketed/blurry; never return exact lat/lon of others.

## 8) Observability
- Prometheus counters:
	- `presence_heartbeats_total{campus_id}`
	- `proximity_queries_total{radius}`
	- `presence_rejects_total{reason}`
- Histograms: request latency.
- Logs: structured JSON; redact PII.

## 9) Frontend Algorithms

### 9.1 Geolocation Watch & Heartbeat loop
```
on app mount:
	if !navigator.geolocation: show error

state:
	campusId from user profile
	desiredRadius in {10,20,50,200} (UI control)
	watchId = navigator.geolocation.watchPosition(
		success(pos):
			store lat, lon, accuracy
		, error(e): log
		, { enableHighAccuracy: true, maximumAge: 5000, timeout: 5000 }
	)

heartbeatLoop every 2s (visibilityState == 'visible'; backoff to 6s hidden):
	if lastPosition && accuracy <= 50:
		POST /presence/heartbeat { lat, lon, accuracy, campus_id, device_id, ts_client }
		socket.emit('presence:heartbeat', same payload) # optional if using socket path

socket connect to /presence:
	socket.emit('nearby:subscribe', { campus_id: campusId, radius_m: desiredRadius })

on radius change:
	socket.emit('nearby:unsubscribe', old)
	socket.emit('nearby:subscribe', new)

on 'nearby:update':
	apply diff to list, keyed by user_id
```

### 9.2 Rendering
- List with distance badges (10/20/50/200 m), friend marker.
- Privacy: show “approximate distance” disclaimer.
- Error toasts on 429/accuracy>50m.

```
distanceBadge = ${distance_m}m (approx)
```

## 10) Constants
- PRESENCE_TTL_S = 90
- MAX_SPEED_MPS = 12
- MAX_ACCURACY_M = 50
- RADIUS_BUCKETS = [10,20,50,200]
- HEARTBEAT_PERIOD_VISIBLE_MS = 2000
- HEARTBEAT_PERIOD_HIDDEN_MS  = 6000

