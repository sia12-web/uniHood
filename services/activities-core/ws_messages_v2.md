# WebSocket Messages v2 (SpeedTyping)

Client -> Server
- {type:'keystroke', payload:{ userId, tClientMs, len, isPaste?:boolean }}
- {type:'submit', payload: SubmitRoundDto}
- {type:'ping', payload:{ tClientMs }}

Server -> Client (additions)
- activity.anti_cheat.flag { userId, type }          // transient UI warning
- activity.penalty.applied { userId, type, amount }  // sent after scoring
- pong { tServerMs, skewEstimateMs }

Server-Side Timer
- On round start: set serverRoundEnd = now + timeLimitMs
- Ignore client keystrokes with normalized time > serverRoundEnd + 200ms
