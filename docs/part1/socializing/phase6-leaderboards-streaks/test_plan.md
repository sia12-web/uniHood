# Phase 6 — Leaderboards & Streaks / test_plan.md

## Fixtures
- Campus C1; users u1..u6 on C1
- Seed minimal user profiles; streaks empty
- Streams faked via direct XADD into Redis or mocked producer functions
- Clock fixed to 2025-10-24; ymd=20251024

## Unit Tests (policy.py / service.py)
1) score formula clamps:
	 - dm_sent=100 -> counted=60
	 - room_sent=200 -> counted=80
	 - rooms_joined=20 -> counted=6
	 - rooms_created=5 -> counted=2
	 - uniq_senders=50 -> counted=20
	 - uniq_invite_accept_from=25 -> counted=10
2) overall with streak multiplier:
	 - current=1 -> mult=1.0
	 - current=15 -> mult≈1.241
	 - current=30 -> mult=1.5
3) anti-gaming:
	 - messages/sec > 5 sustained -> affected interval excluded from dm_sent accrual
4) popularity distinctness:
	 - 10 messages from the same sender count as 1 towards uniq_senders

## Accrual Integration (Redis)
- Simulate events:
	- 2 accepted invites for u1, 1 new friend for u1, 30 DMs from u1 to 10 peers, 50 room msgs from u1
	- Verify HGETALL lb:day:{d}:user:{u1} matches expected counts
	- Distinct sets populated

## Streaks
- Day d: u1 touched -> current=1, best=1
- Day d+1 with touch -> current=2
- Day d+3 with touch (gap) -> current resets to 1, best remains 2

## Snapshots (jobs.py)
- Provisional compute produces ZSETs with expected scores
- Finalization writes lb_daily rows with ranks
- Weekly/monthly rollups sum last 7/30 daily `overall` correctly

## Badges
- Daily top 10 badge awarded once per day
- Streak 30 badge awarded when current≥30 (no duplicates)
- Social Butterfly when distinct peers over last 7d ≥ 15

## API (FastAPI)
- GET /leaderboards/overall?period=daily&campus_id=C1:
	- returns sorted rows by score desc with rank starting at 1
- GET /leaderboards/me/summary:
	- returns ranks/scores for all scopes + streak + badges
- GET /leaderboards/streaks/{user_id}:
	- returns current/best/last_active_ymd

## E2E (Playwright)
- After producing events, trigger snapshot job endpoint (if exposed in test build)
- Visit /leaderboards:
	- verify table content and my highlighted row
	- switch tabs scopes/periods -> data updates
	- StreakBadge shows current/best
	- Badges list rendered

## Security/Privacy
- 401 for unauthenticated
- Results scoped by campus_id; cross-campus query returns empty
- No PII (emails) returned

## Performance
- Accrual consumer keeps lag < 2s with 1k events/sec (mock)
- Snapshot compute for 10k users finishes < 3s (unit timing with mocked data)
