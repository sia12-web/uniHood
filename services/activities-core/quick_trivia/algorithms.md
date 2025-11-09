# Algorithms

ALGO CreateSessionQuickTrivia(...)
  same as SpeedTyping CreateSession but for 'quick_trivia'

ALGO StartSessionQuickTrivia(sessionId)
  cfg := merge(defaultCfg, requestCfg)
  qset := pickQuestions(cfg) // random by difficulty, exclude repeats
  for i,q in enumerate(qset):
    db.Round.create({ sessionId, index:i, state:'queued', payloadJson:{ qId:q.id, question:q.question, options:q.options, timeLimitMs:cfg.timeLimitMs }})
  mark session running; cache.state := {phase:'running', currentRound:0, cfg, answers:{}}
  emit round.started(0) and start server timer

ALGO SubmitRoundQuickTrivia(sessionId, userId, choiceIndex, clientMs?)
  guard: if cache.answers[roundIdx][userId] exists -> ignore
  record responseTimeMs := min(serverNow - roundStart, cfg.timeLimitMs)
  correct := (choiceIndex == question.correctIndex)
  delta := correct ? 1 : 0
  persist ScoreEvent(delta)
  cache.answers[roundIdx][userId] = {choiceIndex, correct, responseTimeMs}
  emit score.updated
  if both answered OR timer elapsed -> endRound()

ALGO EndSessionSummary(sessionId)
  tieBreak := if totalScores equal:
                compute median(responseTimeMs per user across answered) — lower wins.
  include tieBreakWinner in session.ended event metadata.
