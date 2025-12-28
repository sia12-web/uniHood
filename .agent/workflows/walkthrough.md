# Campus XP System Walkthrough

This document summarizes the implementation of the Campus XP system, a reputation-based progression system designed to reward healthy engagement within the UniHood community.

## 1. Core Logic (Backend)

### XP Action Scoring
We defined several positive actions that award XP (defined in `backend/app/domain/xp/models.py`):
- **Daily Login**: 25 XP (Awarded on the first profile fetch/login of the day)
- **Host Meetup**: 50 XP
- **Join Meetup**: 10 XP
- **Win Game**: 20 XP
- **Play Game**: 10 XP
- **Send Message**: 1 XP
- **Profile Update**: 15 XP

### Level Thresholds
Users progress through 6 levels:
1. **Newcomer** (0 XP)
2. **Social Starter** (100 XP)
3. **Connector** (500 XP)
4. **Campus Regular** (1500 XP)
5. **Social Leader** (5000 XP)
6. **Campus Icon** (15000 XP)

## 2. UI/UX Refinement (Frontend)

### LevelBadge Component
A premium badge component that displays the user's level with:
- **Gradients**: Distinct colors for different tiers (e.g., Indigo for regulars, Fuchsia/Violet for Icons).
- **Icons**: Lucide icons (Star, Sparkles, Trophy) to visualy differentiate levels.
- **Glassmorphism**: Subtle backdrops and borders for a modern feel.

### XPOverviewCard Component
Located on the profile page, this card provides:
- **Progression View**: An animated progress bar showing current XP vs next level.
- **Dynamic Feedback**: Encouraging text based on progress.
- **Quick Guide**: A button to open the Campus XP Guide modal.

### Integration Points
- **Profile Page**: Replaced basic progress bar with `XPOverviewCard`.
- **Chat**: Level badges now appear next to the friend's name in the chat header.
- **Discovery**: Verification banner highlights the discovery boost and reputation benefits.
- **Public Profiles**: Level badges integrated into the header and detail modals.

## 3. Database & Persistence
- **Migrations**: 
    - `022_campus_xp.sql`: Core XP stats and event logging.
    - `023_daily_xp.sql`: Tracking daily claims to ensure XP is only awarded once per day.

## 4. Verification
- All frontend components pass linting.
- Backend logic includes anti-cheat protection by strictly tracking events in the DB.
- XP data is now part of the standard `ProfileRecord`, `FriendRow`, and `PublicProfile` schemas.
