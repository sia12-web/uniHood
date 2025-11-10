# OpenAPI Contracts (Authoritative)

## Global
- Versioned at /openapi.json; docs at /docs.
- Security: Bearer JWT (access token) - `Authorization: Bearer <jwt>`.
- Common headers:
  - X-Request-Id (in/out), Idempotency-Key (in), Retry-After (errors: 429).

## Identity
- POST /auth/register, /auth/login, /auth/refresh, /auth/logout, /auth/verify-email, /auth/resend

## Social
- POST /invitations (idempotent on {from_id,to_id} and Idempotency-Key)
- GET /invitations?cursor=&limit=   (cursor = opaque, keyset)

## Chat
- POST /rooms/dm   (idempotent on canonical pair)
- POST /messages   (idempotent on message client_key or Idempotency-Key)
- GET /rooms/{id}/messages?cursor=&limit=

## Attachments
- POST /attachments/presign
- POST /attachments/commit

## Error envelope
- JSON: `{ "detail": "<error_code>", "request_id": "<uuid>", "errors": [ ...? ] }`
