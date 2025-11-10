# Tenant Boundary & Env Gating (Algorithm)

## Campus Scoping
- Each user has `campus_id`; all proximity queries MUST filter by campus_id unless an explicit cross-campus feature is enabled.

## Environments
- `env: paper | canary | live`.
- Headers: `X-Env-Metadata: {commit, build_id}` added by gateway.
- Feature flags: invite-only codes in `paper`, throttle in `canary`.

## Algorithm: Signed Admin Intents
1. For admin ops, require HMAC signature with rotating key.
2. Verify timestamp drift <= 2m.
