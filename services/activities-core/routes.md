# HTTP & WebSocket API

POST /activities/session
- body: CreateSessionDto
- auth: bearer (stub)
- resp: { sessionId }

POST /activities/session/:id/start
- auth: creator or admin
- effect: StartSession

POST /activities/session/:id/join
- body: JoinSessionDto
- effect: register WS permission

GET /activities/session/:id
- resp: SessionView

WS /activities/session/:id/stream
- Subprotocol: 'json'
- Server -> Client events: 
  - activity.session.created {sessionId}
  - activity.session.started {sessionId, currentRound}
  - activity.round.started {sessionId, index, payload: RoundView.payload}
  - activity.score.updated {userId, delta, total}
  - activity.round.ended {index, scoreboard: ScoreboardView}
  - activity.session.ended {finalScoreboard}
- Client -> Server messages:
  - {type:'submit', payload: SubmitRoundDto}
  - {type:'ping'} -> {type:'pong'}
