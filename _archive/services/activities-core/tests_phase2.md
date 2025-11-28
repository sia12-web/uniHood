# Tests Phase 2

Unit
- ewma(): numeric correctness.
- damerauLevenshteinAccuracy(): transposition tolerance.
- penalty application: paste + bursts capped at -30 total? (paste -15 + bursts -15)
- clamp score to >= 0.

Integration
- 'paste' path: simulate paste -> penalty applied -> final score reduced.
- 'burst' path: inject improbable bursts -> penalties stack to -15 max.
- late input: keystrokes after server end ignored in metrics.
- skew: client reports clock ahead by +500ms -> server normalizes; no unfair penalty.

WS
- keystroke stream -> anti_cheat.flag emitted -> on submit -> penalty.applied emitted.
