# Routes for QuickTrivia

POST /activities/session  // already exists; accept activityKey='quick_trivia'
POST /activities/session/:id/start
POST /activities/session/:id/join
WS /activities/session/:id/stream
- Server events for QuickTrivia:
  - activity.round.started { index, payload: { question, options, timeLimitMs } }
  - activity.round.ended { index, scoreboard, correctIndex }
  - activity.session.ended { finalScoreboard, tieBreak?: { winnerUserId } }
- Client -> Server:
  - {type:'submit', payload:{ userId, choiceIndex, clientMs? }}
