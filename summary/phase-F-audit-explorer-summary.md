# Phase F — Moderation Audit Explorer & Timeline Diff

## Overview
- Completed the moderation-focused Phase F scope delivering the audit explorer workspace plus case timeline diff experience.
- Implemented client-side utilities, hooks, and UI needed for staff to browse, filter, export, and inspect audit activity with per-case context.

## Key Deliverables
- **Documentation**: Authored `spec.md` and `test_plan.md` under `parts/04-moderation/frontend/phase-f-audit-explorer/` outlining requirements and coverage.
- **Shared utilities**: Added `lib/download.ts` for export helpers (blob download, cURL generation) and `lib/redact-meta.ts` for allowlist-aware meta scrubbing.
- **Audit data hooks**: Implemented `use-audit-list`, `use-audit-export`, and `use-audit-saved` to handle infinite queries, export workflows, and local saved searches.
- **Explorer UI**: Built filter form, virtualized table, stats strip, saved searches panel, export bar, and enriched audit rows with diff/meta viewers; wired into `/app/(staff)/admin/mod/audit/page.tsx`.
- **Case timeline**: Introduced `/app/(staff)/admin/mod/cases/[caseId]/timeline/page.tsx` that groups audit events by day, exposes jump anchors, and reuses diff/meta components with safe typing.

## Testing & Quality
- `npm run lint`

## Follow-ups
- Run backend integration tests once the moderation API endpoints are available to validate pagination, export payloads, and timeline filters.
- Consider adding Playwright smoke coverage for critical audit explorer interactions (filters, saved searches, export buttons) after backend wiring stabilizes.
