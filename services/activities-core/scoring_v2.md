# Scoring v2 (SpeedTyping)

Inputs
- metrics from v1 + anti-cheat incidents for the round.

Formulas
- WPM smoothing: EWMA with α=0.4 over per-second instantaneous WPM derived from keystrokes; use smoothedWpm for scoring.
- Accuracy: Damerau–Levenshtein ratio (transpositions allowed).
- Completion bonus: +10 if completed AND accuracy >= 0.9; else +0.
- Base score: floor( 6 * sqrt(max(0, smoothedWpm)) * accuracy )
- Penalties (from anti_cheat.md):
   - paste: -15 once if any paste flagged
   - improbable_burst: -5 per incident (max -15)
- Clamp: max(0, base + bonus - penalties)

Pseudocode
computeScoreV2(m, incidents[])
  smoothedWpm := ewma(m.instantWpmSeries, α=0.4)
  base := floor( 6 * sqrt(max(0, smoothedWpm)) * m.accuracy )
  bonus := (m.completed && m.accuracy >= 0.9) ? 10 : 0
  p := 0
  if incidents has 'paste' then p += 15
  p += min(15, 5 * count(incidents where type=='improbable_burst'))
  return max(0, base + bonus - p)
