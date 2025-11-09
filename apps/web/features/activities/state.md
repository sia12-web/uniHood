# State Machines

## Machine Session
- states: idle -> connecting -> lobby -> running(round i) -> ended
- events: JOINED, ROUND_STARTED(i,payload), SCORE_UPDATED(u,delta,total), ROUND_ENDED(i,board), ENDED
- data: sessionId, currentRound, payload, scoreboard

## SpeedTyping UI State
- inputs: textarea bound to local state
- derived: wpm (chars/5 / minutes), accuracy (client-side Levenshtein), progress %
- auto-submit: on timer 0 or Enter when completed
- disable input after submit; show locked state
