# Socket Authentication (Phase D)

## Handshake
- Requires Bearer access token (synthetic format: `uid:...;campus:...;sid:...;handle:...`).
- Reject if: missing/invalid token, campus mismatch on presence/nearby rooms, session revoked (optional check).

## On Connect
- Parse token → user_id, campus_id, session_id.
- Attach socket to rooms: `u:{user_id}`, `c:{campus_id}`.

## Optional: Socket Token Endpoint
- `POST /realtime/ticket` returns a short-lived (60s) opaque ticket bound to user+session.
- Use ticket once in handshake (defends header leakage).
- (Phase D optional—spec below includes it.)
