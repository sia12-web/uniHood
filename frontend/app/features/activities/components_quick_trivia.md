# QuickTrivia UI Components

## QuickTriviaPanel.tsx
- Displays the current trivia question and 4 radio button options.
- User can select one option; after selection, the panel locks and shows a 'Locked' chip.
- Shows a local timer/progress bar; if timer reaches 0, auto-submits with no answer (choiceIndex = -1 is not sent; server treats as no submission).

## LiveSessionShell.tsx (augment)
- Switches rendering by activityKey: 'speed_typing' or 'quick_trivia'.
- For QuickTrivia, shows the correct answer after ROUND_ENDED (green highlight for correct option).

## SummaryView.tsx (augment)
- Renders a tie-break message if present: 'Winner by time advantage: @user'.
