# Request Id & Idempotency propagation

## Files
- frontend/app/api/idempotency.ts
- use in: Invites send, Chat send, Room DM create

## Requirements
- For POSTs that can duplicate (send invite, send message, create DM room):
  - Generate and persist a deterministic idemKey for 60s based on (route + stable payload string).
  - If user resubmits within that window, reuse the same idemKey to guarantee server 200/201 stability.
- Store last requestId + idemKey in a bounded LRU (size 100) for debugging.

## Pseudocode
function computeIdemKey(route, payload):
  s = route + '|' + stableStringify(payload)
  return 'idem_' + sha256(s).slice(0, 32)
