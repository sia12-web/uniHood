# Part 1 & 2 & 3 Testing Guide

This checklist separates automated validation (Parts 1 and 2) from the interactive feature tour (Part 3) so you can run everything from PowerShell without second guessing which command or screen comes next.

## Prerequisites

```powershell
# From the workspace root
cd C:\Users\shahb\OneDrive\Desktop\Divan\frontend
npm install
```

The `npm install` step only needs to run once per environment or whenever dependencies change.

---

## Part 1 — Core Automated Checks

1. **Type checking + lint**
   ```powershell
   npm run lint
   ```
   - Confirms the codebase passes ESLint with the project’s strict settings.

2. **Focused unit test (optional quick health)**
   ```powershell
   npm run test -- __tests__\communities.events.spec.tsx
   ```
   - Runs the spec that covers the latest communities UI updates without waiting for the full suite.

---

## Part 2 — Full Validation Pass

1. **Complete unit suite**
   ```powershell
   npm run test
   ```
   - Executes every Vitest unit test. Expect ~1 minute on a typical laptop because virtualization and calendar specs render several UI states.

2. **Production build**
   ```powershell
   npm run build
   ```
   - Verifies Next.js can produce an optimized build and catches type errors that lint may miss.
   - If the command errors because the `.next` folder is locked, clear it with `Remove-Item -Recurse -Force .next` and rerun.

---

## Part 3 — Manual Feature Tour (Visual Confirmation)

1. **Launch the dev server**
   ```powershell
   npm run dev
   ```
   - Keep this window open; Next.js hot-reloads as you explore.

2. **Open the app in your browser**
   - Navigate to `http://localhost:3000/communities`.
   - Sign in with any test account if authentication is enabled locally; otherwise the stubbed experience loads immediately.

3. **Notifications & Presence (Phase F highlights)**
   - Click the bell icon in the top bar to open the dropdown; mark an item as read with Delete/Backspace to see the optimistic update.
   - Visit `/communities/notifications` to confirm the infinite list, mark-all button, and unread counter sync.
   - Open any group post and watch the comment thread: typing in the composer should light up the “Someone is typing…” pill and show live presence chips next to avatars.

4. **Members roster**
   - Go to `/communities/groups/<groupId>/members`.
   - Verify each member row shows online/offline badges reflecting the presence store.

5. **Events explorer & board**
   - Browse `/communities/events` and toggle the new “Upcoming / Past / All” scope buttons plus “List / Calendar” view switches.
   - Repeat inside a group at `/communities/groups/<groupId>/events` to ensure group-specific filters react the same way.

6. **Wrap up**
   - When finished, stop the dev server with `Ctrl+C` in the PowerShell window.

> 💡 Tip: If you want to capture screenshots for documentation, follow the Part 3 steps in order—the layout is optimized so the new components (notifications, presence, events filters) are in distinct sections without clutter.
