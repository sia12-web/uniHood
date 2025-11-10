# Campus Scoping

- Every write/read that joins on user data must constrain to requester's campus unless explicitly global.
- Helper: `enforce_campus(user_campus_id, target_campus_id)` → raises 403 `cross_campus_forbidden` on mismatch.
