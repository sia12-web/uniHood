# Components

## ChooseActivityModal.tsx
- One card: title 'Who Types Faster', subtitle 'SpeedTyping • ~1–2 min', CTA 'Start'
- On click -> createSession -> open LiveSessionShell

## LiveSessionShell.tsx
- Header: opponent avatar(s), session status, countdown
- Body: <SpeedTypingPanel />
- Right Rail: Scoreboard mini {userId, score}
- Toasts: 'Round X started', '+{delta} points', 'You win!'/'Tie!'

## SpeedTypingPanel.tsx
- Shows the text sample in a monospace box
- Textarea for typing; local derived metrics (WPM, accuracy, progress)
- Submit on Enter (if completed) or when timer hits 0
- After submit: lock input, show local metrics snapshot

## SummaryView.tsx
- Final scoreboard, winner highlight, 'Rematch' button (relaunch createSession)
