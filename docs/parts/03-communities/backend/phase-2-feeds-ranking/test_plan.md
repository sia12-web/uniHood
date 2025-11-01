# test_plan.md — Communities · Backend Phase 2 — Feeds & Ranking

## 0) Scope
Validate ranking correctness, fan-in/fan-out, idempotency, pagination, rebuild jobs, and Redis persistence.

## 1) Unit Tests
- `compute_rank()` produces monotonic decay over time.  
- Pin boost adds ≥ 1.5× score.  
- Engagement increases rank.  
- Cursor encode/decode round-trip.  

## 2) Integration Tests
- Fan-out worker:
	- Consumes post events, inserts feed_entry rows, writes to Redis.  
	- Idempotent on duplicate event IDs.  
	- Correct `rank_score` persisted.  
- Rank updater:
	- Recomputes ranks for posts < 24 h.  
	- No change for older posts (decay stable).  
- Feed rebuild:
	- Rebuilds feed for user who joined new group.  
	- Deletes stale entries.  
- API GET /feeds/user:
	- Returns posts ordered by rank_score.  
	- Pagination `after` cursor correct.  
- API GET /feeds/group/{gid}:
	- Returns group’s posts ranked on-the-fly.  
	- Private group requires membership.  

## 3) Performance
- Fan-out ≤ 500 members / post → under 200 ms.  
- Rank update job < 5 s for 10 k posts.  
- Feed query (20 posts) < 80 ms p95.

## 4) Resilience
- Redis write failure → retries ×3, DLQ record.  
- Postgres duplicate feed_entry → ignored.  
- Fan-out worker resumes after crash (last stream ID tracked).

## 5) E2E Scenario
1. User A creates post → fan-out to group members (User B,C).  
2. Users B,C fetch user feeds → post appears ranked highest.  
3. After 3 h with no engagement → rank decays as expected.  
4. User B comments → engagement increases rank; verify higher score.  
5. Admin pins post → score boosted 1.5×.  
6. Soft-delete post → removed from ZSETs + feed_entry.  
7. Run `POST /feeds/rebuild` → feeds consistent.

## 6) Metrics Assertions
- Prometheus counters increment as expected.  
- Latency histogram filled per bucket.  
- DLQ size = 0 after successful retries.

## 7) Coverage Targets
≥ 85 % services/workers, ≥ 80 % API.  
Testcontainers: PostgreSQL 16 + Redis 7 + OpenSearch mock.
