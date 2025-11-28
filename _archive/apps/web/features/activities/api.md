# Client SDK

- createSession(activityKey: 'speed_typing', userIds: [string,string]) -> {sessionId}
- joinSession(sessionId: string): Promise<void>
- startSession(sessionId: string): Promise<void>
- submitRound(sessionId: string, payload: { typedText: string, clientMs?: number })
- useSessionStream(sessionId: string): {
    state, // same as Session machine
    send(data) // sends WS messages
  }
