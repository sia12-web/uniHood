# Idempotency

## Header
- `Idempotency-Key: <opaque up to 128 chars>`
- TTL: 24h (configurable)

## Algorithm
1. On write endpoints, extract key (if absent, generate internal key).
2. Begin transaction.
3. Look up `idempotency_keys` by (key, handler); if found with `result_id`:
   - Return 200/201 with existing result.
4. Else, perform the operation once, capture `result_id`.
5. Upsert `idempotency_keys(key, handler, result_id, expires_at)`.
6. Commit.
7. Return response; include `Idempotency-Key` header.

## Conflict
- If the same key is replayed with **different semantic input** (detected via a stored hash), return 409 `idempotency_conflict`.
