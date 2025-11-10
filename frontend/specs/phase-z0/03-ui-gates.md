# Phase Z0-C — UI Gates

## Goal
Ship moderation, safety, and media V2 components in the bundle while keeping them invisible when their flags are off.

## Requirements
- Re-export UI components through `withFlag` wrappers:
  - Moderation reporting widgets (`ReportButton`, `ReportDialog`, `ReportProvider`, etc.) bound to `FLAGS.MOD_UI`
  - Safety panels and quick actions bound to `FLAGS.SAFETY_UI`
  - Media V2 pickers/uploader prototypes bound to `FLAGS.MEDIA_V2`
- Replace existing usages with the gated exports (e.g., `<ReportButton />` → `<ReportUI />`).
- Preserve MVP-critical behaviour such as block/unblock actions even when the safety flag is off.
- Ensure hidden components still tree-shake or render `null` without causing layout shifts.

## Deliverables
- Updated moderation, safety, and media components guarded via `withFlag`
- Navigation or menu items conditioned on the relevant flag
