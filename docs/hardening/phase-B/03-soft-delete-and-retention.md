# Soft Delete & Retention

## Soft delete columns
- Add `deleted_at TIMESTAMPTZ NULL` to: users?, rooms, messages, invitations.

## Uniqueness with soft delete
- Unique indexes must exclude soft-deleted rows via `WHERE deleted_at IS NULL`.

## Retention
- messages: purge hard after 365d (configurable)
- sessions: keep 180d
- invitations: keep 90d after decided
- Implement cron jobs: `purge_soft_deleted_*` honoring foreign keys.

## Algorithm
1) On delete → set `deleted_at = NOW()`; do not cascade.
2) Nightly job: move soft-deleted + expired by retention to hard delete in batches (LIMIT 1k).
