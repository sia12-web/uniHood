# Rate Limits and Backpressure (Phase D)

## Per-socket Event Rate
- Max 10 `presence.update` per 10s; 4 `nearby.request` per 5s.
- Global per-user (all sockets): 30 events / 10s.
- If exceeded: send `sys.warn { code: "rate_limited" }`, drop event.

## Backpressure
- If outbound queue > N (e.g., 200), start dropping low-priority emits (typing/activities) before presence.
