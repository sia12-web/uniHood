# Token Lifecycle (Algorithm)

## Types
- Access Token (JWT, short TTL 10–15m)
- Refresh Token (opaque or JWE, TTL 7–30d, rotation on use)

## Algorithm: Issue on Login
1. Validate credentials.
2. Create session record: {session_id, user_id, created_at, ua_hash, ip_hash, refresh_fingerprint}.
3. Generate Access (scopes) + Refresh (bind to session_id + fingerprint).
4. Set cookies (see cookie file) and return access in memory only.

## Algorithm: Refresh
1. Verify refresh cookie presence + fingerprint cookie.
2. Look up session_id; ensure not revoked/expired.
3. Rotate refresh token:
   - Invalidate old, create new with new fingerprint.
4. Return new access (short TTL) and set new refresh cookie.

## Algorithm: Logout
1. Revoke session_id (soft delete).
2. Clear cookies (httpOnly, secure, sameSite=strict).

## Algorithm: Compromise Handling
- On refresh misuse (old + new seen):
  - Revoke all sessions for user_id on matching fingerprint.
  - Force re-auth; emit alert.

## Claims/Scopes
- `sub`, `exp`, `iat`, `ver` (token version), `sid` (session), `scp` (scopes)
- No PII in claims.
