# Campus Privacy Partitioning

## Rule
- Every SELECT for user-visible data MUST include `campus_id = :user.campus_id` unless the feature is cross-campus.
- Cross-campus features must pass an explicit flag in service/controller and be audited.

## Enforcement helpers (Python)
- `require_same_campus(user_campus_id, row_campus_id)` raise on mismatch.
- Repository helpers auto-bind `campus_id` on list queries.

## (Optional) RLS
- Future: Postgres Row Level Security with `current_setting('app.campus_id')`.
