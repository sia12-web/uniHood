# Phase Z0-B — Route Guards

## Goal
Prevent gated functionality from being reachable via direct routes while keeping the code available for later enablement.

## Requirements
- Introduce `requireFlag` guard that reads from `useFlags` and redirects to a safe destination (404 or home) when the flag is disabled.
- Combine with existing role guards (e.g., `requireRole`) for staff-only areas.
- Apply guard to:
  - `/moderation/**/*` → requires `FLAGS.MOD_UI` and appropriate roles
  - `/settings/safety` and nested routes → require `FLAGS.SAFETY_UI`
  - Any Media v2 preview routes → require `FLAGS.MEDIA_V2`
- Ensure global navigation (menus, sidebars, quick links) hide entries when the corresponding flag is off.

## Deliverables
- `frontend/app/lib/guards/requireFlag.tsx`
- Route-level usage wrapping moderation/safety pages
- Navigation components updated to omit gated links when disabled
