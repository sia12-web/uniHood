# Discovery Swipe Deck (Tinder-style)

## Overview
- New backend API surface under `/discovery`:
  - `GET /discovery/feed?cursor&limit`: ranked cards sourced from proximity (for now), filtered to exclude already liked/passed targets.
  - `POST /discovery/like` `{ target_id, cursor? }`: records a like and detects mutual matches.
  - `POST /discovery/pass` `{ target_id, cursor? }`: records a pass.
  - `POST /discovery/undo` `{ target_id, cursor? }`: clears prior like/pass for that target.
- Interactions are stored in Redis sets (`discovery:like:{user}`, `discovery:pass:{user}`, `discovery:match:{user}`) as a first pass before persisting to Postgres.

## Frontend
- `DiscoverySwipeDeck` component consumes `/discovery/feed`, renders stacked cards, and performs optimistic like/pass actions.
- Integrated into the dashboard under the Discovery section; styling matches existing cards.

## Follow-ups
- Persist interactions/matches in Postgres with migrations and add real ranking signals (interests, activity, distance).
- Emit `discovery.match` sockets + notifications.
- Add safety actions (block/report) on card and swipe rate limiting.
