# Anti-Cheat Scoring System

This document describes the comprehensive anti-cheat system implemented for the Divan Social Score leaderboards. The system prevents abuse while maintaining a fair and engaging competitive environment.

## Overview

The Social Score combines three activity categories:
- **Friends** — Making connections and messaging
- **Meetups** — Creating and joining rooms/events
- **Games** — Playing and winning activities

Each action earns points, but the anti-cheat system applies multiple layers of protection to prevent exploitation.

---

## Scoring Weights

### Friends Category
| Action | Points | Notes |
|--------|--------|-------|
| Accept friend invite | 30 | Per invite accepted |
| New friend | 50 | Mutual connection established |
| Send DM | 2 | Capped at 50/day total |
| Room message | 1 | Capped at 50/day total |

### Meetups Category
| Action | Points | Notes |
|--------|--------|-------|
| Join meetup | 30 | Must stay 10+ minutes |
| Create/host meetup | 100 | Must have 2+ attendees |

### Games Category
| Action | Points | Notes |
|--------|--------|-------|
| Play game | 50 | Per completed game |
| Win game | 150 | Bonus on top of play points |

### Popularity Bonus
| Metric | Points | Cap |
|--------|--------|-----|
| Unique people messaging you | 10 | 20/day |
| Unique people accepting your invites | 20 | 10/day |

---

## Anti-Cheat Protections

### 1. Daily Caps

Global limits prevent unlimited point farming:

| Counter | Daily Cap |
|---------|-----------|
| DMs counted | 50 messages |
| Room messages counted | 50 messages |
| Room joins counted | 10 joins |
| Room creations counted | 3 creations |
| New friends counted | 10 friends |
| Unique senders counted | 20 people |
| Unique invite accepters | 10 people |

### 2. Per-Opponent/Per-Recipient Limits

Prevents farming points from the same person repeatedly:

| Limit | Value | Purpose |
|-------|-------|---------|
| Games per opponent daily | 2 | Prevents game farming with friends |
| DMs per recipient daily | 10 | Prevents message spam to same person |
| Friends per day | 10 | Prevents mass fake account friending |

### 3. Cooldowns Between Actions

Enforces time gaps between repeated actions:

| Action | Cooldown | Purpose |
|--------|----------|---------|
| Game with same opponent | 30 minutes | Prevents rapid rematches |
| DM to same person | 5 minutes | Prevents message spam |
| Rejoin same meetup | 1 hour | Prevents join-leave abuse |

### 4. Meetup Validation

Meetups must meet quality thresholds:

| Requirement | Value | What Happens |
|-------------|-------|--------------|
| Minimum duration | 15 minutes | Meetup must last this long |
| Minimum attendees | 2 people | Including host |
| Stay duration | 10 minutes | User must stay to get join points |
| Cancel penalty window | 5 minutes | Cancelling within this = no points |

### 5. Game Validation

Games must show real engagement:

| Requirement | Value | Purpose |
|-------------|-------|---------|
| Minimum duration | 30 seconds | No instant surrenders |
| Minimum moves | 3 actions | Proves actual gameplay |

### 6. Burst Rate Limiting

Prevents automated spam attacks:

| Parameter | Value | Description |
|-----------|-------|-------------|
| RPS threshold | 5 msg/sec | Maximum message rate |
| Burst window | 10 seconds | Measurement window |
| Mute duration | 10 seconds | Temporary pause on detection |

---

## Fraud Detection

### Win Trading Detection

The system monitors for suspicious alternating win patterns:

- **Window**: Last 7 days
- **Threshold**: 4 alternations (A beats B, B beats A, A beats B, B beats A)
- **Action**: Flagged for review

### Rapid Join-Leave Detection

Monitors meetup join-leave patterns:

- **Threshold**: 3 join-leaves on same meetup in a day
- **Action**: Subsequent joins blocked, flagged for review

### Create-Cancel Ratio

Tracks meetup creation vs cancellation:

- **Threshold**: >50% cancellation rate
- **Action**: Flagged for review

---

## Streak Multiplier

Active users get a bonus multiplier on their overall score:

| Days Active | Multiplier |
|-------------|------------|
| 1 day | 1.0× |
| 15 days | 1.25× |
| 30+ days | 1.5× |

The multiplier scales linearly from 1.0 to 1.5 across 30 days.

---

## Technical Implementation

### Redis Key Patterns

All anti-cheat tracking uses Redis with 24-hour TTL:

```
ac:game_pair:{day}:{sorted_pair}     # Game opponent daily count
ac:game_cd:{sorted_pair}             # Game opponent cooldown
ac:dm_pair:{day}:{from}:{to}         # DM recipient daily count
ac:dm_cd:{from}:{to}                 # DM recipient cooldown
ac:meetup_cd:{user}:{meetup}         # Meetup join cooldown
ac:meetup_join:{user}:{meetup}       # Meetup join timestamp
ac:meetup_created:{meetup}           # Meetup creation tracking
ac:joinleave:{day}:{user}:{meetup}   # Join-leave pattern tracking
ac:friends_daily:{day}:{user}        # Daily friend count
lb:muted:{channel}:{user}            # Burst rate limit mute
lb:burst:{channel}:{user}            # Burst event tracking
```

### Code Location

| Component | Path |
|-----------|------|
| Policy configuration | `backend/app/domain/leaderboards/policy.py` |
| Accrual logic | `backend/app/domain/leaderboards/accrual.py` |
| Service layer | `backend/app/domain/leaderboards/service.py` |
| Unit tests | `backend/tests/unit/test_anticheat_scoring.py` |

### Integration Points

The anti-cheat system is integrated into:

- **Chat service** — DM recording calls `record_dm_sent()`
- **Social service** — Friendship recording calls `record_friendship_accepted()`
- **Meetups service** — Room events call `record_room_created()`, `record_room_joined()`, `record_room_left()`, `record_room_cancelled()`
- **Activities service** — Game completion calls `record_activity_outcome()`

---

## Scheduled Jobs

### Leaderboard Snapshot Job

Runs every 5 minutes and once at startup:

1. Collects all user activity from Redis counters
2. Applies anti-cheat caps via `clamp_daily_counters()`
3. Computes scores with weights and streak multipliers
4. Persists to database and Redis sorted sets
5. Awards daily badges

### Configuration

```python
# In backend/app/main.py lifespan
scheduler.schedule_minutes(
    "leaderboard-snapshot",
    leaderboard_jobs.finalize_daily_leaderboards,
    minutes=5
)
```

---

## Testing

The anti-cheat system has comprehensive unit test coverage (59 tests):

### Test Categories

1. **Game Opponent Limits** — Daily caps, cooldowns, symmetry
2. **DM Recipient Limits** — Daily caps, cooldowns, independence
3. **Meetup Join/Leave** — Cooldowns, duration validation, attendee checks
4. **Meetup Create/Cancel** — Penalty window, creation tracking
5. **Friendship Limits** — Daily caps for both users
6. **Game Validation** — Duration and move count requirements
7. **Fraud Detection** — Join-leave patterns, win trading
8. **Streak Multiplier** — Linear scaling formula
9. **Burst Rate Limiting** — RPS detection and muting
10. **Service Layer** — End-to-end integration

### Running Tests

```bash
cd backend
pytest tests/unit/test_anticheat_scoring.py -v
```

---

## Example Scenarios

### Scenario 1: Normal Gameplay

Alice and Bob play a 2-minute TicTacToe game. Alice wins.

| Check | Result |
|-------|--------|
| Game duration ≥ 30s | ✅ Pass (120s) |
| Game moves ≥ 3 | ✅ Pass (9 moves) |
| Daily opponent limit | ✅ Pass (1st game today) |
| Opponent cooldown | ✅ Pass (no recent game) |

**Points awarded:**
- Alice: 50 (played) + 150 (won) = 200 pts
- Bob: 50 (played) = 50 pts

### Scenario 2: Suspected Farming

Charlie and Dave play 5 quick games in 1 hour:

| Game | Duration | Result |
|------|----------|--------|
| Game 1 | 45s | ✅ Points awarded |
| Game 2 | 50s | ✅ Points awarded (2nd of day) |
| Game 3 | 40s | ❌ Blocked (daily limit 2) |
| Game 4 | 35s | ❌ Blocked (daily limit 2) |
| Game 5 | 55s | ❌ Blocked (daily limit 2) |

**Result**: Only first 2 games count. System logged the attempts.

### Scenario 3: Meetup Join-Leave Abuse

Eve joins and leaves a meetup 3 times in quick succession:

| Action | Result |
|--------|--------|
| Join #1 | Recorded, timer started |
| Leave #1 (2 min) | No points (didn't stay 10 min) |
| Join #2 | ❌ Blocked (1 hour cooldown) |
| Join #3 | ❌ Blocked (flagged as suspicious) |

---

## Configuration Reference

All anti-cheat constants are in `backend/app/domain/leaderboards/policy.py`:

```python
# Per-opponent/per-user daily limits
GAMES_PER_OPPONENT_DAILY = 2
DMS_PER_RECIPIENT_DAILY = 10
FRIENDS_PER_DAY_CAP = 10

# Cooldowns (seconds)
GAME_OPPONENT_COOLDOWN = 1800      # 30 min
DM_RECIPIENT_COOLDOWN = 300        # 5 min
MEETUP_JOIN_COOLDOWN = 3600        # 1 hour

# Meetup validation
MEETUP_MIN_DURATION_MINUTES = 15
MEETUP_MIN_ATTENDEES = 2
MEETUP_STAY_DURATION_MINUTES = 10
MEETUP_CANCEL_PENALTY_WINDOW = 300  # 5 min

# Game validation
GAME_MIN_DURATION_SECONDS = 30
GAME_MIN_MOVES = 3

# Fraud detection
WIN_TRADE_DETECTION_WINDOW = 7
WIN_TRADE_ALTERNATION_THRESHOLD = 4
RAPID_JOIN_LEAVE_THRESHOLD = 3
CREATE_CANCEL_RATIO_THRESHOLD = 0.5

# Burst rate limiting
BURST_RPS_THRESHOLD = 5
BURST_WINDOW_SECONDS = 10
MUTED_TTL_SECONDS = 10
```

---

## Future Enhancements

Potential improvements for future versions:

1. **Machine Learning** — Anomaly detection for unusual patterns
2. **IP Tracking** — Same-IP sockpuppet detection
3. **Account Age Verification** — Minimum age for full points
4. **Trust Score Integration** — Reduce points for low-trust accounts
5. **Real-time Alerts** — Admin notifications for suspicious activity
6. **Appeal System** — User dispute workflow for false positives

---

*Last updated: December 2024*
