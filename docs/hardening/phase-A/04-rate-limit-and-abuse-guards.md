# Rate Limit & Abuse Guards (Algorithm)

## Buckets
- IP-based + user-identifier-based.
- Sliding window counters in Redis.

## Algorithm
1. Before handler, compute keys: ip_hash, email_hash?.
2. Increment counters; if threshold exceeded → 429 with Retry-After.
3. Emit metric: `auth_rate_limit_exceeded{endpoint}`.
4. Honeypot field on signup: reject if present.
5. Email/phone verification attempt caps (per 24h).
