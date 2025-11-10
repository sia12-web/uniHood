# Consistency: Idempotency & Uniqueness

## Idempotency keys
- For message send and invite send: accept `Idempotency-Key` header; store (key -> result_id, ttl 24h).

## Uniqueness
- Invitations: UNIQUE(from_id, to_id) WHERE deleted_at IS NULL
- Rooms: for DMs, UNIQUE on canonical pair (min(userA,userB), max(userA,userB))

## Versioning
- For PATCH-es, include `version` or `updated_at` precondition when needed.
