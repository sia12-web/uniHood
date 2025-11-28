# Algorithm Patches for Phase 2

Patch SubmitRound(sessionId, userId, submission)
  // computeTypingMetrics now returns instant series from keystrokes
  metrics := computeTypingMetricsV2(roundIdx, userId, payload.textSample, submission.typedText)
  incidents := detectIncidents(roundIdx, userId) // from stored keystrokes
  delta := computeScoreV2(metrics, incidents)
  persist AntiCheatEvent rows for incidents
  emit('activity.penalty.applied', { userId, types: incidentTypes(incidents), delta })
  // remaining flow unchanged from v1

Patch onWSKeystroke(sessionId, userId, sample)
  normT := sample.tClientMs + skewEstimate(sessionId,userId)
  append sample {t:normT,len:sample.len,isPaste:sample.isPaste} into Redis keystrokes buffer
  check online incidents; if any -> emit('activity.anti_cheat.flag', ...)

Patch onPing
  update skew EWMA: skew := clamp(EWMA(skew, serverNow - tClientMs, α=0.4), -600, +600)
  reply pong with skew
