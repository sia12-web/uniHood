# QuickTrivia v1

Goal
- Fast MCQ quiz between two users with time pressure and light anti-abuse.

Entities (reuse core)
- Activity('quick_trivia')
- ActivitySession, Participant, Round(payload holds one MCQ)

Question Bank
- Table TriviaQuestion(id, question, options[4], correctIndex, difficulty ENUM('E','M','H'), tags TEXT[])
- Seed ~60 questions (10E/10M/10H per domain: general, science, culture) — minimal.

Scoring
- +1 for correct; 0 otherwise
- Tie-breaker: faster median response time wins the match (compute in summary).

Timers
- Per-round timeLimitMs default 18, configurable 12..25

Anti-abuse (MVP)
- Lock answer after selection; no change allowed.
- Rate limit: 1 answer per round per user; server enforces.
