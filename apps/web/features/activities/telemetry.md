# Client Telemetry

Emit keystroke packets at most every 80ms OR Δlen>=5 OR paste:
- { tClientMs: performance.now(), len, isPaste? }

## UI Guards
- Prevent paste default into textarea but still detect (show toast 'Paste detected — may reduce score').
- Timer is display-only; server is authoritative.
- On anti_cheat.flag -> inline warning chip for 2s.

## Skew Estimation
- Send ping every 5s with tClientMs; show connection badge with "Good/Fair/Poor" based on skew|rtt.
