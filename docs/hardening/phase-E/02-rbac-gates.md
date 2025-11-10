# RBAC Gates

- Role model already exists (Role, Permission, UserRole).
- Gate annotation:
  - @require_roles("admin") for admin routers
  - @require_perms("flags.write") for feature-flag mutations
- Campus scope:
  - @require_same_campus if route targets campus-bound resources
- Deny path returns 403 with `detail="forbidden"` or `detail="cross_campus_forbidden"`.

- Default policy: deny by default on admin, flags, moderation, verify.
