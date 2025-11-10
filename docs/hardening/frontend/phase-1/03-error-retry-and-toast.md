# Error/Retry/Toast (Algorithm)

## API Client
- Retries: network errors (up to 2 with jitter).
- Do not retry 4xx except 429 (respect Retry-After).

## Toasts
- Show inline field errors from server schema.
- Global fatal errors include `request_id` when present.

## Loading
- Prevent double-submit with disabled state.
