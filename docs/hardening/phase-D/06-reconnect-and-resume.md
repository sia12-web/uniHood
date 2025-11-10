# Reconnect and Resume (Phase D)

## Fast Resume
- If disconnect < 30s, on connect with same session_id:
  - Rejoin rooms, re-emit latest presence snapshot to the socket only.
- If beyond TTL, require `presence.go_live` again.
