# Error Envelope

## Shape
- Always include: `detail` (machine code), `request_id` (uuid), optional `errors` (list of field errors).

## HTTP mapping
- 400 validation / policy
- 401 invalid_token / unauthenticated
- 403 forbidden / cross_campus_forbidden
- 404 not_found
- 409 conflict (uniques, idempotent replay w/ different payload)
- 429 rate_limited_{ip|id|email}
- 500 internal

## Logging
- Log `request_id`, `user_id?`, `ip_hash`, `handler` at warning (4xx) / error (5xx).
