# Session & Cookies (Algorithm)

## Cookies
- `refresh_token`: httpOnly, secure, sameSite=Strict, path=/auth/refresh
- `rf_fp` (fingerprint): sameSite=Strict, secure, not httpOnly (used by FE to signal presence)
- Access token stays in memory (never cookie/localStorage).

## Algorithm: Set Cookies
1. On login/refresh:
   - Set `refresh_token` with TTL = refresh TTL.
   - Set `rf_fp` (random nonce) with same TTL.
2. On logout:
   - Clear both with expired date.

## Session Store
- DB or Redis: key by `session_id`.
- Index: user_id + last_seen (for admin kill sessions).
- Update last_seen on refresh.
