# Components Patch

## SpeedTypingPanel.tsx
- Wire keystroke batching using requestAnimationFrame + 80ms throttle.
- Detect paste via onPaste; show warning toast.
- Lock textarea after submit or when ROUND_ENDED received.
- Show smoothed WPM and accuracy (computed locally for display only).
- Accessibility: textarea has aria-describedby linking to stats row.

## LiveSessionShell.tsx
- Surface penalty banners when activity.penalty.applied arrives.
- Connection badge shows skew status ('Good' <200ms, 'Fair' <400ms, else 'Poor').

## Tests
- Keystroke emission cadence under typing; paste triggers warning.
