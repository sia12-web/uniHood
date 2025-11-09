# Wiring

- Add "Play" button in 1:1 chat toolbar -> opens ChooseActivityModal
- On Start:
   const {sessionId} = await createSession('speed_typing', [me, peer])
   await joinSession(sessionId)
   if (amCreator) await startSession(sessionId)
   mount LiveSessionShell(sessionId)
- useSessionStream(sessionId) maps WS events -> state machine transitions
- submitRound() fired from SpeedTypingPanel on submit/timeout
- Analytics (stub):
   track('activity_event', { type, sessionId })
