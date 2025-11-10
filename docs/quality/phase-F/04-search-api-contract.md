# Search API

GET /search
  q: string (1..120)
  type: one of [people, rooms, posts] (multi allowed as comma list)
  campus: optional UUID (default = viewer.campus)
  cursor: opaque
  limit: 10..50 (default 20)

Response:
{
  "q": "...",
  "buckets": {
    "people": { "items":[...], "next": cursor|null },
    "rooms":  { "items":[...], "next": cursor|null },
    "posts":  { "items":[...], "next": cursor|null }
  }
}

Scoring knobs (from flags):
- search.beta.trgm_weight (default 0.3)
- search.beta.ts_weight (default 0.7)
- search.recency_tau_hours (default 24)
