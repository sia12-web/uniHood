# Signed Intents

## Headers
- X-Intent: base64url(JSON) of:
  {
    "method":"POST",
    "path":"/rooms/create",
    "body_sha256":"<hex>",
    "user_id":"<uuid>",
    "session_id":"<uuid>",
    "ts": 1731141000,        # unix seconds
    "nonce":"<opaque up to 32>"   # unique per intent
  }
- X-Signature: hex(HMAC-SHA256(secret_key, X-Intent raw string))
- X-Key-Id: optional key selector (defaults to SERVICE_SIGNING_KEY)

## Server verification
1) Parse and HMAC-verify `X-Intent`.
2) Enforce method/path match and `body_sha256` against raw request body.
3) User/session in intent must match the authenticated principal.
4) Reject if clock skew |ts-now| > ALLOWED_SKEW (default 60s).
5) Reject if nonce is replayed within TTL (default 10 min) — use Redis: `SETNX nonce:<nonce> 1 EX=600`.
6) For idempotent ops, `Idempotency-Key` still applies (orthogonal).

## Errors
- 401 `intent_missing` / `intent_bad_sig`
- 409 `intent_replay`
- 400 `intent_mismatch` (method/path/body/user/session)
- 400 `intent_stale`
