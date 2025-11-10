# Socket.IO resilience

## Files
- frontend/app/lib/socket/presence.ts
- frontend/app/lib/socket/chat.ts
- frontend/app/lib/socket/rooms.ts

## Requirements
- Handshake:
  - Prefer `ticket` from `/ops/realtime-ticket`; fallback to `Authorization` Bearer token
- Reconnect:
  - Exponential backoff with jitter; max interval 8s; reset after 60s stable
  - When reconnecting, show small banner "Reconnecting…" and queue optimistic UI events
- Heartbeat:
  - Send `hb` every 15s when connected; pause when tab hidden to 45s
- Backpressure:
  - If outbound queue > 200, drop low-priority events (typing indicators) first
- Nearby pagination:
  - Maintain cursor; on "presence.nearby", append and keep stable keys by user id
