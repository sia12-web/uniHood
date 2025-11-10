# Phase Z0-A — Flags & Kill-switches

## Purpose
Keep post-MVP surfaces dormant while the code ships by default. Provide a front-end flag system capable of bootstrapping from environment and runtime script overrides, with optional server evaluation.

## Requirements
- Declare new UI flags with safe defaults:
  - `ui.moderation.enabled` → `false`
  - `ui.safety.enabled` → `false`
  - `ui.media.v2.enabled` → `false`
  - `ui.metrics.ux.enabled` → `true`
  - `ui.blur.sensitive.enabled` → `true`
- Expose a hook (`useFlags`) that merges the following sources (later wins):
  1. `import.meta.env` / `process.env.NEXT_PUBLIC_FLAG_*`
  2. `window.__BOOT_FLAGS__` injected at bootstrap
  3. `/flags/evaluate` API response (cached for 30s)
- Provide helpers:
  - `has(key: string): boolean` → coercion-friendly truthiness check
  - `variant(key: string): string | undefined` → typed accessor for multivariate flags
  - `reload(): Promise<void>` → optional manual refresh hook
- Supply flag keys via `FLAGS` constant and a `withFlag` HOC that renders `null` (or an optional fallback) when disabled.
- Default HTML bootstrap should preload `window.__BOOT_FLAGS__` with the new keys set to `false` so production can opt-in later.

## Deliverables
- `frontend/app/lib/flags/keys.ts`
- `frontend/app/lib/flags/useFlags.ts`
- `frontend/app/lib/flags/withFlag.tsx`
- Root layout script tag establishing `window.__BOOT_FLAGS__`
- Environment defaults (`NEXT_PUBLIC_FLAG_UI_*`) documented in `.env.example`
