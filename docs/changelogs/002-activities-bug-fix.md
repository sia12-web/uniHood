# Activities Bug Fix - 2025-11-25

## Summary
Fixed a bug where creating a story activity would trigger an incorrect "Speed Typing Duel" notification.

## Root Cause
The `useTypingDuelInvite` hook was using a legacy API endpoint that returned all activity types and failed to filter them correctly due to a mismatch between expected field names (`activityKey`) and actual data structure (`kind`).

## Changes

### Frontend (`frontend/hooks/activities/use-typing-duel-invite.ts`)

1. **Replaced Legacy API Call**:
   - Old: `listSpeedTypingSessions("pending")` from legacy sessions endpoint
   - New: `listActivities()` from the proper `/activities` API

2. **Fixed Filter Logic**:
   - Added check for `kind === "typing_duel"` to filter only typing activities
   - Added check for `state === "lobby"` to find pending invites
   - Updated participant logic to use `user_a` and `user_b` fields

3. **Code Cleanup**:
   - Removed unused `pickOpponent` helper function
   - Updated imports to use proper auth utilities

## Impact
- Story activities no longer trigger typing duel notifications
- Typing duel notifications continue to work correctly
- More consistent with other activity hooks (e.g., `useStoryInvite`)

## Verification
To test the fix:
1. Create a story activity and verify no typing notification appears
2. Create a typing duel and verify the notification works
3. Create both types simultaneously to ensure no interference
