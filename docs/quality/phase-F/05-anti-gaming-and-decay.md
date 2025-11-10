# Anti-Gaming & Decay

- Engagement caps: at most X likes per account per hour count toward score (per viewer).
- Sybil dampening: new accounts (<7d) contribute 0.25x engagement weight.
- Repeated self-boost: author liking own content => ignored.
- Cooldown: per post, only first 10 likes per minute counted fully (others 0.1x that minute).
- Decay: if no engagement for 3h, apply additional 0.85 multiplier per 3h period.
- Fraud signals → moderation queue threshold: if weighted anomalies > T, mark for review.
