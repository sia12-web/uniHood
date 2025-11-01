# Phase F — Realtime Presence & Notifications

## Overview
- Delivered the Phase F objectives focused on realtime notifications and member presence across the communities experience.
- Added new UI surfaces (dropdown bell, notifications center, members roster enhancements) backed by socket-driven updates, optimistic mutations, and presence-aware hooks.

## Key Deliverables
- **Notifications experience**
  - Added dropdown bell with keyboard navigation, unread counters, optimistic mark-as-read mutations, and toast feedback on failure.
  - Implemented notifications center page with infinite scrolling, mark-all-as-read handling, and soft state updates to keep dropdown/list caches in sync.
  - Introduced TanStack Query hooks for dropdown/list/unread data and websocket bridge for live updates.
- **Presence & typing integration**
  - Expanded Zustand presence store plus `usePresence` / `useTyping` hooks to cover comment threads and group members roster.
  - Wired live indicators into `comment-thread`, `comment-item`, and `comment-composer`, including typing hints and cleanup on unmount.
  - Added members panel UI that renders presence badges, fallback copy, and error states while consuming stubbed `listGroupMembers` API.
- **Supporting libraries & hooks**
  - Exposed new members query hook and stub data in `lib/communities.ts` to drive the roster panel.
  - Optimized notification mark-read logic with resilient cache updates and introduced `vi.hoisted` mocks for deterministic testing.
  - Ensured optimistic post creation payloads mirror `GroupPost` shape and hardened event components (`rsvp-panel`, `venue-block`) against missing fields.

## Testing & Quality
- `npm run lint`
- `npm run build`
- `npm run test`

## Follow-ups
- Address the Vite CJS deprecation warning by upgrading to the ESM API when convenient.
- Expand automated coverage for presence/typing hooks and the roster UI if future regressions are a concern.
