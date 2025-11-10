# Network client hardening

## Files to implement
- frontend/app/lib/http/client.ts
- frontend/app/lib/http/errors.ts
- frontend/app/lib/http/retry.ts

## Requirements (algorithmic)
- All fetches go through client.ts `apiFetch(input, { method, body, signal, idemKey? })`.
- Attach headers:
  - 'Content-Type': 'application/json' when body present
  - 'X-Request-Id': generated v4 per request if none present
  - 'Authorization': 'Bearer ' + accessToken (from session store)
  - 'X-Idempotency-Key': if `idemKey` is provided
- Implement retry policy in retry.ts:
  - Retry on: 429, 503, 504, ECONNRESET, ETIMEDOUT
  - Backoff: exponential with jitter: base=250ms, cap=5s, maxAttempts=4
  - Respect `Retry-After` when 429 present
- Handle JSON decoding robustly:
  - If `Content-Type` includes json → parse; else return text
- Map errors in errors.ts:
  - 401 → throw AuthError (triggers re-login modal)
  - 403 → throw ForbiddenError
  - 409 with `detail === 'idempotency_conflict'` → throw IdemConflictError
  - 410 → GoneError (show “link expired”)
  - default → HttpError(status, detail)

## Pseudocode
function apiFetch(input, opts):
  requestId = opts.headers['X-Request-Id'] ?? uuidv4()
  token = sessionStore.getAccessToken()
  headers = merge({
    'X-Request-Id': requestId,
    'Authorization': token ? 'Bearer '+token : undefined,
  }, contentTypeIfBody, opts.headers)

  attempt = 0
  while true:
    res = await fetch(url, {method, headers, body, signal})
    if res.ok: return decode(res)
    if shouldRetry(res) && attempt < maxAttempts:
      await sleep(backoff(attempt, res))
      attempt++
      continue
    throw mapToError(res, requestId)
