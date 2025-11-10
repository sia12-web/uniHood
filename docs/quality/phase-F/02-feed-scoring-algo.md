# Feed Scoring Pipeline (Keyset + Cache)

Inputs: viewer_id, campus_id, cursor=(score,id,created_at), limit

1) Candidate Fetch:
   - Start from outbox/index tables (already built by communities workers).
   - Time window: last 7 days.
   - Hard filters: campus gating, block lists, viewer privacy.
   - Pre-limit: top 1000 by (created_at DESC) for the first page; use cursor for next.

2) Feature Fetch:
   - For each candidate, load:
     counts: likes, comments, saves, shares
     author_id, author_trust/rep
     tags (if any), campus_id
     friendship bit with viewer

3) Score:
   - Compute S using coefficients (from feature flags).
   - Apply freshness exp-decay.

4) Post-processing:
   - Diversity cap per author (e.g., ≤ 2 per 20).
   - Remove blocked authors.
   - Sort by S DESC, tie-breaker created_at DESC, id DESC.

5) Pagination:
   - Return items[:limit], next_cursor = base64({score, created_at, id})

Caching:
- Cache per viewer first page for 30s (Redis: feed:{viewer_id}).
- Invalidate on: new post from friends, heavy engagement spikes.
