# Algorithms (SpeedTyping)

Definitions
- REGISTERED_ACTIVITIES = { 'speed_typing' }
- SpeedTyping.config: { rounds: number=1..5, timeLimitMs: 30000..60000, textLen: 60..120 }
- Text bank: local in-memory pangrams; TODO: move to DB later.

ALGO CreateSession(activityKey, creatorUserId, participants[])
  assert activityKey == 'speed_typing'
  assert participants.length == 2 and unique
  session := db.ActivitySession.create({ activityId: findActivity('speed_typing').id, status: 'pending' })
  for each p in participants:
     db.Participant.create({ sessionId: session.id, userId: p, score: 0 })
  cache.set(`sess:${session.id}:state`, { phase: 'lobby', currentRound: -1 })
  emit('activity.session.created', { sessionId: session.id })
  return session.id

ALGO StartSession(sessionId, byUserId)
  assert isCreatorOrAdmin(sessionId, byUserId)
  sState := cache.get(`sess:${sessionId}:state`)
  assert sState.phase == 'lobby'
  cfg := defaultSpeedTypingConfig()
  rounds := buildSpeedTypingRounds(cfg)
  db.transaction:
    for i,r in enumerate(rounds):
      db.Round.create({ sessionId, index: i, state: 'queued', payloadJson: r })
  db.ActivitySession.update({ where:{id:sessionId}, data:{ status:'running', startedAt: now() }})
  cache.set(`sess:${sessionId}:state`, { phase:'running', currentRound: 0, cfg, submissions: {} })
  emit('activity.session.started', { sessionId, currentRound: 0 })
  emit('activity.round.started', { sessionId, index: 0 })
  startServerTimer(sessionId, 0, cfg.timeLimitMs)

HELPER buildSpeedTypingRounds(cfg)
  results := []
  repeat cfg.rounds times:
     text := pickRandomText(length in [cfg.textLen.min..cfg.textLen.max])
     results.push({ textSample: text, timeLimitMs: cfg.timeLimitMs })
  return results

ALGO SubmitRound(sessionId, userId, submission)
  guard: rateLimit(userId, sessionId)  // Redis sliding window 5 req / 2s
  roundIdx := cache.get(`sess:${sessionId}:state`).currentRound
  round := db.Round.findUnique({ sessionId, index: roundIdx })
  assert round.state == 'running' OR round.state == 'queued'  // we switch to 'running' upon first submission or timer start
  s := cache.get(`sess:${sessionId}:state`)
  if not s.submissions[roundIdx]: s.submissions[roundIdx] = {}
  if s.submissions[roundIdx][userId] exists: return  // lock per-user per-round
  // compute score
  payload := round.payloadJson
  metrics := computeTypingMetrics(payload.textSample, submission.typedText, submission.clientMs)
  delta := computeScore(metrics)
  db.ScoreEvent.create({ sessionId, userId, delta, reason:'round' })
  db.Participant.incrementScore(sessionId, userId, delta)
  s.submissions[roundIdx][userId] = { delta, metrics }
  cache.set(`sess:${sessionId}:state`, s)
  emit('activity.score.updated', { sessionId, userId, delta, total: getTotal(sessionId, userId) })
  // check round end
  if both participants submitted OR server timer elapsed:
     endRound(sessionId, roundIdx)

ALGO onServerTimerElapsed(sessionId, roundIdx)
  endRound(sessionId, roundIdx)

ALGO endRound(sessionId, roundIdx)
  mark db.Round[index] = 'done', endedAt=now()
  emit('activity.round.ended', { sessionId, index: roundIdx, scoreboard: getScoreboard(sessionId) })
  next := roundIdx + 1
  if next < totalRounds(sessionId):
     cache.update(`sess:${sessionId}:state`, { currentRound: next })
     emit('activity.round.started', { sessionId, index: next })
     startServerTimer(sessionId, next, cfg.timeLimitMs)
  else:
     db.ActivitySession.update({ status:'ended', endedAt: now() })
     emit('activity.session.ended', { sessionId, finalScoreboard: getScoreboard(sessionId) })
     cache.del(`sess:${sessionId}:state`)

METRIC computeTypingMetrics(targetText, typedText, clientMs?)
  timeMs := clamp(clientMs ?? inf, 0, 10*60*1000)
  wpm := computeWPM(typedText, timeMs)
  accuracy := levenshteinAccuracy(targetText, typedText) // 0..1
  completed := typedText.length >= targetText.length
  return { wpm, accuracy, completed, timeMs }

SCORE computeScore(m)
  // Base score prioritizes speed*accuracy with completion bonus
  base := round(wpmToPoints(m.wpm) * m.accuracy)
  bonus := m.completed ? 10 : 0
  return max(0, base + bonus)

FUNCTION wpmToPoints(wpm)
  // Sublinear scaling to avoid runaway scores
  return floor( 5 * sqrt(max(0, wpm)) )
