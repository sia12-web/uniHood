# Moderation · Frontend Phase B — Content Safety Review & Hash Lists UI · Test Plan

## 0) Scope
Covers quarantine detail actions, OCR reveal, thresholds simulate/apply flow, hash import/export, URL viewer, RBAC, and accessibility checks.

## 1) Unit (Jest + RTL)
- **signals-panel** renders bars with exact values; pHash shown/copy works.
- **ocr-drawer** hidden by default; reveal logs audit call; closes via Esc.
- **decision-bar** disables buttons while pending; passes note to mutation.
- **thresholds-editor** validates numeric ranges; generates payload; blocks apply before simulate.
- **hash-import-wizard** parses CSV/YAML; flags invalid rows; chunking logic.

## 2) Integration (MSW)
- **Quarantine detail**:
  - `GET /attachments/:id` + `GET /text_scans` load; decisions post and refresh list.
  - 409 conflict on decision shows banner.
- **Thresholds**:
  - Simulate returns impact report; Apply with token succeeds; without token → 409.
- **Hashes**:
  - List filters (algo/label/source) affect query; delete row calls `DELETE /hashes/:id`.
  - Import posts in chunks; progress advances; success toast.
- **URL viewer**:
  - Search by domain shows rows; expand shows redirects and linked subjects.

## 3) E2E (Playwright)
- Admin navigates to an attachment; reveals media (confirm); marks **Blocked**; subject hidden post-reload.
- Thresholds: lowers image nsfw soft_review → simulate shows +120 items to review; Apply confirms.
- Hashes: import 1k rows CSV; table shows new entries; deleting one updates instantly.
- URLs: query a phishing domain; verdict “malicious” visible; clicking a subject opens post detail in a new tab.

## 4) Accessibility (axe)
- No critical violations; dialogs labeled; sliders have numeric inputs; tables have headers.

## 5) Security
- Moderator cannot access thresholds/hashes import (admin-only controls hidden; server 403 if forced).
- Reveal requires justification; audit call sent.

## 6) Performance
- Hash list virtualized for >1k rows; search debounced (200 ms).
- Quarantine detail preview lazy-loads actual image only after reveal.

## 7) Coverage Targets
- ≥ 85% components/hooks; ≥ 80% integration; E2E smoke green.
