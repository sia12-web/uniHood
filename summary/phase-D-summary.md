# Phase D — Admin Tools & Macros Runner UI

## Highlights
- Delivered the staff-admin tooling suite under `/admin/mod/tools`, guarding access via `requireAdmin()`.
- Implemented catalog, macro runner, batch unshadow, batch revert, bundles, and job monitor pages backed by dedicated hooks and shared confirmation flows.
- Added bundle import/export wizardry plus reusable job list/detail cards to track long-running operations and NDJSON exports.
- Expanded telemetry events in `lib/obs/safety.ts` so UI-safe metrics cover catalog creation, macro execution, unshadow batches, reverts, and bundle imports.
- Introduced Vitest coverage for job list/detail rendering to keep regressions from slipping in.

## Verification
- `npm run lint`
- `npm run test -- __tests__/tools.jobs.spec.tsx`

## Manual Follow-ups
1. Exercise every admin tool against the live backend to validate API contracts and telemetry fire as expected.
2. Add automated coverage for bundle import confirmation and macro/unshadow/revert form validation once endpoints stabilize for mocking.
