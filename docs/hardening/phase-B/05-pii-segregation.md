# PII Segregation (lightweight, MVP-safe)

## Email/Phone
- Keep email in users for now (CITEXT); later can move to users_pii(user_id PK, email, phone, ...) with FK.
- Never put phone or addresses into tokens, logs, or claims.

## JSONB hygiene
- No PII inside `privacy`, `status`, or `meta`.
