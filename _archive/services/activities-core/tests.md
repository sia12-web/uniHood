# Tests (Vitest)

Unit
- computeWPM: exact seconds -> expected WPM for typed char length
- levenshteinAccuracy: tolerance to minor errors; returns [0..1]
- computeScore: monotonic in wpm; completion bonus applied

Integration
- create -> join both -> start -> both submit -> session ends -> final scores monotonic
- timer elapse: one submits, other does not; round still ends and session proceeds
- rate limit: >5 submissions / 2s by same user -> last ones rejected with 429-ish error

WS Harness
- connect two mock sockets; assert event order:
  created -> started -> round.started -> score.updated* -> round.ended -> ... -> session.ended
