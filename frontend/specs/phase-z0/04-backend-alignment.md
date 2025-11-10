# Phase Z0-D — Backend Alignment Checklist

Even with the UI gated, backend endpoints must remain protected.

## Verify
- Staff moderation routes require administrator or moderator roles server-side.
- Reporting/appeals endpoints enforce rate limits and idempotency checks.
- Safety and moderation APIs do not leak privileged data when the caller lacks roles.
- CORS and auth middleware still guard production origins.
- Every request includes `X-Request-Id` so flagged traffic can be audited if manually enabled.

## Notes
No additional backend changes are required for the lockdown pass provided the above guarantees hold.
