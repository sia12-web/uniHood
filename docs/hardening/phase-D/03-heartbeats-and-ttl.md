# Heartbeats and TTL (Phase D)

## Client Heartbeats
- Client emits heartbeat every `settings.presence_keepalive_interval_seconds` (default 15s).
- Server updates `updated_at` and refreshes TTL on `presence:{user_id}`; maintains GEO point.

## Stale Sweep
- Background task every 30s scans campus GEOSET for members missing `presence:{id}`.
- RedisProxy geosearch already filters, but sweep cleans up.
