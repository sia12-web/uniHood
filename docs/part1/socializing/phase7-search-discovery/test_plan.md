# Phase 7 — Search & Discovery / test_plan.md

## Fixtures
- Campus C1 with users: u1 (me), u2..u8
- Friendships:
	- u1 ↔ u2 accepted
	- u1 ↔ u3 none
	- u2 ↔ u3 accepted (mutual with u1 via u2)
- Privacy:
	- u4 visibility="none"      -> never searchable unless friend (not a friend)
	- u5 visibility="friends"   -> only visible to accepted friends
	- u6 ghost_mode=true        -> excluded from discovery
	- u7 everyone
	- u8 everyone
- Rooms:
	- r1 link, active (messages today), r2 private, r3 link low activity

## Unit — ranking.py
1) user score:
	 - higher similarity(handle, q) lifts score
	 - prefix boost applied when handle startswith q
	 - friend boost applied (+0.1 factor)
	 - mutual_count increases score via ln(1+mutual)/4
	 - clamp to ≤ 1.5
2) room score:
	 - messages_24h dominates; size & overlap contribute

## Unit — policy.py
- visibility="none" -> filtered
- visibility="friends" -> filtered unless requester is accepted friend
- ghost_mode=true -> excluded from discovery; allowed in exact search only if friend
- blocked users -> excluded both ways

## API (FastAPI)
### /search/users
- q shorter than 2 -> 200 empty
- finds by handle prefix and display ILIKE
- u4 (none) not returned
- u5 (friends-only) not returned (since not friend)
- u6 (ghost) not returned
- results ordered by score desc; ties by id
- pagination: limit=2 returns cursor; next page continues without duplicates

### /discover/people
- excludes current friends and blocked
- includes mutuals (e.g., u3) ranked above others
- excludes u6 (ghost)
- pagination works

### /discover/rooms
- returns only visibility='link'
- r1 > r3 due to msg_24h
- r2 private excluded
- pagination works

## Rate Limits
- >60 requests in a minute -> 429
- Response contains Retry-After header (optional)

## E2E (Playwright)
- Typing "fa" finds "farhad" (handle) before "Al Farhan" (display) due to prefix boost
- Empty query shows people discovery cards
- Rooms tab shows trending list; scroll loads more with cursor

## Performance (local)
- /search/users P95 < 120ms for campus with 10k users (seeded with faker)
- /discover/rooms P95 < 120ms with 10k messages in last 24h

## Security/Privacy
- No emails or sensitive PII in responses
- Campus scoping enforced: cross-campus users/rooms excluded
- Blocked relationships filtered both ways

