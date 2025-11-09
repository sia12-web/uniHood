# Tests (Vitest)

Unit
- pickQuestions respects difficulties and count
- scoring: +1 only for correct; no double answering

Integration
- create -> start -> both answer -> ends with correct scoreboard
- timer: one answers, other times out -> round ends with single score
- tie-break: equal points -> faster median wins

WS
- event order + correctIndex included only after round end (to avoid cheating)
