# Anti-Cheat (SpeedTyping v2)

Goals
- Penalize pasting, improbable bursts, and post-timer edits.
- Smooth WPM; compensate modest client clock skew.
- Provide audit events for moderation.

Runtime Signals (client -> server WS)
- 'keystroke' events: { tClientMs, len, isPaste?: boolean } emitted on each input change and paste.
- 'submit' remains the authoritative final payload.

Server State (Redis: sess:{id}:state)
- Add: { skewMsEstimate: number, keystrokes: { [roundIdx]: { [userId]: Array<{t:ms,len:number,isPaste?:bool}> } } }

Heuristics
- Paste detection: any keystroke with isPaste=true OR Δlen >= 10 within < 50ms -> flag 'paste'.
- Burst typing: moving window 1000ms where Δlen > 40 -> flag 'improbable_burst'.
- Late typing: keystroke tServer > roundEnd + 200ms -> ignore in metrics, add 'late_input'.
- Skew estimate: EWMA from (serverNow - tClientMs) sampled on ping/pong; clamp ±600ms.

Penalties (applied in scoring_v2)
- paste: -15 points; cap total floor at 0 after penalties.
- improbable_burst: -5 points per incident, max -15 per round.
- late_input: typed after server end -> excluded from accuracy/wpm; no extra penalty.

Audit Log (DB table)
- Table AntiCheatEvent(id, sessionId, roundIndex, userId, type, metaJson, at)
- Types: 'paste', 'improbable_burst', 'late_input'

WS Handling
- On 'keystroke': store sample (normalized to server time using skewMsEstimate); run online checks -> if incident, emit 'activity.anti_cheat.flag' {userId, type}.
- On round end: finalize incidents, persist AntiCheatEvent rows.
