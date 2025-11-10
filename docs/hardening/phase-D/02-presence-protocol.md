# Presence Protocol (Phase D)

## Keyspace
- `presence:{user_id}` → HASH { lat, lon, campus_id, radius_m, status, updated_at, session_id } (TTL = `settings.presence_keepalive_idle_seconds`)
- `presence:campus:{campus_id}` → GEOSET of user_id at (lon,lat)

## Client Emits
- `presence.go_live` { lat, lon, radius_m }
- `presence.update` { lat, lon, radius_m? }
- `presence.go_ghost` (clears presence)

## Server Emits
- `presence.nearby` { users:[{id,dist_m,handle,avatar}], cursor? }
- `presence.gone` { id } to interested sockets
