"""
Comprehensive tests for the anti-cheat scoring system.

Tests cover:
- Game opponent limits and cooldowns
- DM recipient limits and cooldowns  
- Meetup join/leave/create/cancel tracking
- Friendship daily limits
- Game duration and move validation
- Fraud detection patterns
"""

import math
from datetime import datetime, timedelta, timezone
from typing import Optional
from unittest.mock import AsyncMock, patch, MagicMock

import pytest

from app.domain.leaderboards import policy
from app.domain.leaderboards.accrual import LeaderboardAccrual
from app.domain.leaderboards.service import LeaderboardService


# ============================================================================
# HELPER FUNCTIONS
# ============================================================================

def _now() -> datetime:
	return datetime.now(timezone.utc)


def _day_stamp(when: Optional[datetime] = None) -> str:
	when = when or _now()
	return when.strftime("%Y%m%d")


# ============================================================================
# GAME OPPONENT LIMIT TESTS
# ============================================================================

class TestGameOpponentLimits:
	"""Tests for per-opponent daily game limits."""

	@pytest.mark.asyncio
	async def test_game_opponent_limit_allows_first_games(self, fake_redis):
		"""First games with an opponent should be allowed."""
		user_a = "user-a-123"
		user_b = "user-b-456"
		day = _day_stamp()

		# First game should be allowed
		allowed = await policy.check_game_opponent_limit(user_a, user_b, day)
		assert allowed is True

	@pytest.mark.asyncio
	async def test_game_opponent_limit_blocks_after_cap(self, fake_redis):
		"""Games beyond the daily cap should be blocked."""
		user_a = "user-a-123"
		user_b = "user-b-456"
		day = _day_stamp()

		# Record games up to the limit
		for _ in range(policy.GAMES_PER_OPPONENT_DAILY):
			await policy.increment_game_opponent_count(user_a, user_b, day)

		# Next game should be blocked
		allowed = await policy.check_game_opponent_limit(user_a, user_b, day)
		assert allowed is False

	@pytest.mark.asyncio
	async def test_game_opponent_limit_symmetric(self, fake_redis):
		"""Limit should be same regardless of who is 'user' vs 'opponent'."""
		user_a = "user-a-123"
		user_b = "user-b-456"
		day = _day_stamp()

		# Record game as user_a vs user_b
		await policy.increment_game_opponent_count(user_a, user_b, day)

		# Check limit from user_b's perspective - should see same count
		allowed_b = await policy.check_game_opponent_limit(user_b, user_a, day)
		# After 1 game, should still be allowed (cap is 2)
		assert allowed_b is True

		# Record another game
		await policy.increment_game_opponent_count(user_b, user_a, day)

		# Now both perspectives should be blocked
		allowed_a = await policy.check_game_opponent_limit(user_a, user_b, day)
		allowed_b = await policy.check_game_opponent_limit(user_b, user_a, day)
		assert allowed_a is False
		assert allowed_b is False

	@pytest.mark.asyncio
	async def test_game_opponent_different_opponents_independent(self, fake_redis):
		"""Limits with different opponents should be independent."""
		user_a = "user-a-123"
		user_b = "user-b-456"
		user_c = "user-c-789"
		day = _day_stamp()

		# Max out games with user_b
		for _ in range(policy.GAMES_PER_OPPONENT_DAILY):
			await policy.increment_game_opponent_count(user_a, user_b, day)

		# Should still be able to play with user_c
		allowed = await policy.check_game_opponent_limit(user_a, user_c, day)
		assert allowed is True


# ============================================================================
# GAME OPPONENT COOLDOWN TESTS
# ============================================================================

class TestGameOpponentCooldown:
	"""Tests for cooldown between games with same opponent."""

	@pytest.mark.asyncio
	async def test_cooldown_not_set_initially(self, fake_redis):
		"""No cooldown should exist initially."""
		user_a = "user-a-123"
		user_b = "user-b-456"

		allowed = await policy.check_game_opponent_cooldown(user_a, user_b)
		assert allowed is True

	@pytest.mark.asyncio
	async def test_cooldown_blocks_after_set(self, fake_redis):
		"""Cooldown should block after being set."""
		user_a = "user-a-123"
		user_b = "user-b-456"

		await policy.set_game_opponent_cooldown(user_a, user_b)

		allowed = await policy.check_game_opponent_cooldown(user_a, user_b)
		assert allowed is False

	@pytest.mark.asyncio
	async def test_cooldown_symmetric(self, fake_redis):
		"""Cooldown should apply regardless of direction."""
		user_a = "user-a-123"
		user_b = "user-b-456"

		await policy.set_game_opponent_cooldown(user_a, user_b)

		# Both directions should be blocked
		allowed_ab = await policy.check_game_opponent_cooldown(user_a, user_b)
		allowed_ba = await policy.check_game_opponent_cooldown(user_b, user_a)
		assert allowed_ab is False
		assert allowed_ba is False


# ============================================================================
# DM RECIPIENT LIMIT TESTS
# ============================================================================

class TestDMRecipientLimits:
	"""Tests for per-recipient daily DM limits."""

	@pytest.mark.asyncio
	async def test_dm_limit_allows_first_messages(self, fake_redis):
		"""First messages to a recipient should be allowed."""
		sender = "sender-123"
		recipient = "recipient-456"
		day = _day_stamp()

		allowed = await policy.check_dm_recipient_limit(sender, recipient, day)
		assert allowed is True

	@pytest.mark.asyncio
	async def test_dm_limit_blocks_after_cap(self, fake_redis):
		"""Messages beyond the daily cap should be blocked."""
		sender = "sender-123"
		recipient = "recipient-456"
		day = _day_stamp()

		# Record messages up to the limit
		for _ in range(policy.DMS_PER_RECIPIENT_DAILY):
			await policy.increment_dm_recipient_count(sender, recipient, day)

		# Next message should be blocked
		allowed = await policy.check_dm_recipient_limit(sender, recipient, day)
		assert allowed is False

	@pytest.mark.asyncio
	async def test_dm_limit_directional(self, fake_redis):
		"""DM limits should be per-direction (A->B independent of B->A)."""
		user_a = "user-a-123"
		user_b = "user-b-456"
		day = _day_stamp()

		# Max out A -> B messages
		for _ in range(policy.DMS_PER_RECIPIENT_DAILY):
			await policy.increment_dm_recipient_count(user_a, user_b, day)

		# A -> B should be blocked
		allowed_ab = await policy.check_dm_recipient_limit(user_a, user_b, day)
		assert allowed_ab is False

		# B -> A should still be allowed
		allowed_ba = await policy.check_dm_recipient_limit(user_b, user_a, day)
		assert allowed_ba is True

	@pytest.mark.asyncio
	async def test_dm_different_recipients_independent(self, fake_redis):
		"""Limits with different recipients should be independent."""
		sender = "sender-123"
		recipient_b = "recipient-b"
		recipient_c = "recipient-c"
		day = _day_stamp()

		# Max out messages to recipient_b
		for _ in range(policy.DMS_PER_RECIPIENT_DAILY):
			await policy.increment_dm_recipient_count(sender, recipient_b, day)

		# Should still be able to message recipient_c
		allowed = await policy.check_dm_recipient_limit(sender, recipient_c, day)
		assert allowed is True


# ============================================================================
# DM COOLDOWN TESTS
# ============================================================================

class TestDMCooldown:
	"""Tests for cooldown between DMs to same recipient."""

	@pytest.mark.asyncio
	async def test_dm_cooldown_not_set_initially(self, fake_redis):
		"""No cooldown should exist initially."""
		sender = "sender-123"
		recipient = "recipient-456"

		allowed = await policy.check_dm_recipient_cooldown(sender, recipient)
		assert allowed is True

	@pytest.mark.asyncio
	async def test_dm_cooldown_blocks_after_set(self, fake_redis):
		"""Cooldown should block after being set."""
		sender = "sender-123"
		recipient = "recipient-456"

		await policy.set_dm_recipient_cooldown(sender, recipient)

		allowed = await policy.check_dm_recipient_cooldown(sender, recipient)
		assert allowed is False

	@pytest.mark.asyncio
	async def test_dm_cooldown_directional(self, fake_redis):
		"""DM cooldown should be directional."""
		user_a = "user-a-123"
		user_b = "user-b-456"

		# Set cooldown A -> B
		await policy.set_dm_recipient_cooldown(user_a, user_b)

		# A -> B should be blocked
		allowed_ab = await policy.check_dm_recipient_cooldown(user_a, user_b)
		assert allowed_ab is False

		# B -> A should still be allowed
		allowed_ba = await policy.check_dm_recipient_cooldown(user_b, user_a)
		assert allowed_ba is True


# ============================================================================
# MEETUP JOIN/LEAVE TRACKING TESTS
# ============================================================================

class TestMeetupJoinLeaveTracking:
	"""Tests for meetup join time recording and duration validation."""

	@pytest.mark.asyncio
	async def test_join_time_recorded(self, fake_redis):
		"""Join time should be recorded correctly."""
		user_id = "user-123"
		meetup_id = "meetup-456"
		now = _now()

		await policy.record_meetup_join_time(user_id, meetup_id, now=now)

		join_time = await policy.get_meetup_join_time(user_id, meetup_id)
		assert join_time is not None
		assert math.isclose(join_time, now.timestamp(), rel_tol=1e-3)

	@pytest.mark.asyncio
	async def test_join_time_not_found_when_not_set(self, fake_redis):
		"""Join time should be None when not recorded."""
		user_id = "user-123"
		meetup_id = "meetup-456"

		join_time = await policy.get_meetup_join_time(user_id, meetup_id)
		assert join_time is None

	@pytest.mark.asyncio
	async def test_stay_duration_passes_when_long_enough(self, fake_redis):
		"""Duration check should pass when user stayed long enough."""
		user_id = "user-123"
		meetup_id = "meetup-456"
		join_time = _now() - timedelta(minutes=policy.MEETUP_STAY_DURATION_MINUTES + 5)
		now = _now()

		await policy.record_meetup_join_time(user_id, meetup_id, now=join_time)

		passed = await policy.check_meetup_stay_duration(user_id, meetup_id, now=now)
		assert passed is True

	@pytest.mark.asyncio
	async def test_stay_duration_fails_when_too_short(self, fake_redis):
		"""Duration check should fail when user left too early."""
		user_id = "user-123"
		meetup_id = "meetup-456"
		join_time = _now() - timedelta(minutes=5)  # Only 5 minutes
		now = _now()

		await policy.record_meetup_join_time(user_id, meetup_id, now=join_time)

		passed = await policy.check_meetup_stay_duration(user_id, meetup_id, now=now)
		assert passed is False

	@pytest.mark.asyncio
	async def test_stay_duration_fails_when_no_join_recorded(self, fake_redis):
		"""Duration check should fail when no join was recorded."""
		user_id = "user-123"
		meetup_id = "meetup-456"
		now = _now()

		passed = await policy.check_meetup_stay_duration(user_id, meetup_id, now=now)
		assert passed is False


# ============================================================================
# MEETUP COOLDOWN TESTS
# ============================================================================

class TestMeetupCooldown:
	"""Tests for cooldown on rejoining same meetup."""

	@pytest.mark.asyncio
	async def test_meetup_cooldown_not_set_initially(self, fake_redis):
		"""No cooldown should exist initially."""
		user_id = "user-123"
		meetup_id = "meetup-456"

		allowed = await policy.check_meetup_join_cooldown(user_id, meetup_id)
		assert allowed is True

	@pytest.mark.asyncio
	async def test_meetup_cooldown_blocks_after_set(self, fake_redis):
		"""Cooldown should block after being set."""
		user_id = "user-123"
		meetup_id = "meetup-456"

		await policy.set_meetup_join_cooldown(user_id, meetup_id)

		allowed = await policy.check_meetup_join_cooldown(user_id, meetup_id)
		assert allowed is False

	@pytest.mark.asyncio
	async def test_meetup_cooldown_per_meetup(self, fake_redis):
		"""Cooldown should be specific to each meetup."""
		user_id = "user-123"
		meetup_a = "meetup-a"
		meetup_b = "meetup-b"

		await policy.set_meetup_join_cooldown(user_id, meetup_a)

		# Meetup A should be blocked
		allowed_a = await policy.check_meetup_join_cooldown(user_id, meetup_a)
		assert allowed_a is False

		# Meetup B should be allowed
		allowed_b = await policy.check_meetup_join_cooldown(user_id, meetup_b)
		assert allowed_b is True


# ============================================================================
# MEETUP CREATION AND CANCELLATION TESTS
# ============================================================================

class TestMeetupCreationCancellation:
	"""Tests for meetup creation tracking and cancel penalty."""

	@pytest.mark.asyncio
	async def test_meetup_creation_recorded(self, fake_redis):
		"""Meetup creation should be recorded for tracking."""
		user_id = "user-123"
		meetup_id = "meetup-456"
		now = _now()

		await policy.record_meetup_creation(user_id, meetup_id, now=now)

		# Verify data was stored (check via cancel penalty)
		penalty = await policy.check_meetup_cancel_penalty(meetup_id, now=now)
		assert penalty is True  # Just created, so cancel would incur penalty

	@pytest.mark.asyncio
	async def test_cancel_penalty_applies_when_too_quick(self, fake_redis):
		"""Cancel penalty should apply when cancelled within window."""
		user_id = "user-123"
		meetup_id = "meetup-456"
		create_time = _now()
		cancel_time = create_time + timedelta(seconds=60)  # 1 minute later

		await policy.record_meetup_creation(user_id, meetup_id, now=create_time)

		penalty = await policy.check_meetup_cancel_penalty(meetup_id, now=cancel_time)
		assert penalty is True  # Within 5-minute window

	@pytest.mark.asyncio
	async def test_cancel_penalty_not_applies_when_long_enough(self, fake_redis):
		"""Cancel penalty should not apply when waited long enough."""
		user_id = "user-123"
		meetup_id = "meetup-456"
		create_time = _now() - timedelta(minutes=10)  # Created 10 minutes ago
		cancel_time = _now()

		await policy.record_meetup_creation(user_id, meetup_id, now=create_time)

		penalty = await policy.check_meetup_cancel_penalty(meetup_id, now=cancel_time)
		assert penalty is False  # Beyond 5-minute window

	@pytest.mark.asyncio
	async def test_cancel_penalty_no_creation_record(self, fake_redis):
		"""Cancel penalty should be False when no creation was recorded."""
		meetup_id = "meetup-456"
		now = _now()

		penalty = await policy.check_meetup_cancel_penalty(meetup_id, now=now)
		assert penalty is False


# ============================================================================
# RAPID JOIN-LEAVE DETECTION TESTS
# ============================================================================

class TestRapidJoinLeaveDetection:
	"""Tests for detecting suspicious rapid join-leave patterns."""

	@pytest.mark.asyncio
	async def test_not_suspicious_initially(self, fake_redis):
		"""User should not be suspicious initially."""
		user_id = "user-123"
		meetup_id = "meetup-456"
		day = _day_stamp()

		suspicious = await policy.is_suspicious_join_leave(user_id, meetup_id, day)
		assert suspicious is False

	@pytest.mark.asyncio
	async def test_suspicious_after_threshold(self, fake_redis):
		"""User should be marked suspicious after hitting threshold."""
		user_id = "user-123"
		meetup_id = "meetup-456"
		day = _day_stamp()

		# Track rapid join-leaves up to threshold
		for _ in range(policy.RAPID_JOIN_LEAVE_THRESHOLD):
			await policy.track_rapid_join_leave(user_id, meetup_id, day)

		suspicious = await policy.is_suspicious_join_leave(user_id, meetup_id, day)
		assert suspicious is True

	@pytest.mark.asyncio
	async def test_rapid_join_leave_per_meetup(self, fake_redis):
		"""Suspicious status should be specific to each meetup."""
		user_id = "user-123"
		meetup_a = "meetup-a"
		meetup_b = "meetup-b"
		day = _day_stamp()

		# Make user suspicious for meetup_a only
		for _ in range(policy.RAPID_JOIN_LEAVE_THRESHOLD):
			await policy.track_rapid_join_leave(user_id, meetup_a, day)

		# Should be suspicious for meetup_a
		suspicious_a = await policy.is_suspicious_join_leave(user_id, meetup_a, day)
		assert suspicious_a is True

		# Should not be suspicious for meetup_b
		suspicious_b = await policy.is_suspicious_join_leave(user_id, meetup_b, day)
		assert suspicious_b is False


# ============================================================================
# FRIENDSHIP DAILY LIMIT TESTS
# ============================================================================

class TestFriendshipDailyLimit:
	"""Tests for daily new friendship limits."""

	@pytest.mark.asyncio
	async def test_friend_limit_allows_first_friends(self, fake_redis):
		"""First friends should be allowed."""
		user_id = "user-123"
		day = _day_stamp()

		allowed = await policy.check_daily_friend_limit(user_id, day)
		assert allowed is True

	@pytest.mark.asyncio
	async def test_friend_limit_blocks_after_cap(self, fake_redis):
		"""Friends beyond the daily cap should be blocked."""
		user_id = "user-123"
		day = _day_stamp()

		# Record friends up to the limit
		for _ in range(policy.FRIENDS_PER_DAY_CAP):
			await policy.increment_daily_friend_count(user_id, day)

		# Next friend should be blocked
		allowed = await policy.check_daily_friend_limit(user_id, day)
		assert allowed is False

	@pytest.mark.asyncio
	async def test_friend_limit_per_user(self, fake_redis):
		"""Friend limits should be independent per user."""
		user_a = "user-a-123"
		user_b = "user-b-456"
		day = _day_stamp()

		# Max out user_a's friends
		for _ in range(policy.FRIENDS_PER_DAY_CAP):
			await policy.increment_daily_friend_count(user_a, day)

		# User A should be blocked
		allowed_a = await policy.check_daily_friend_limit(user_a, day)
		assert allowed_a is False

		# User B should still be allowed
		allowed_b = await policy.check_daily_friend_limit(user_b, day)
		assert allowed_b is True


# ============================================================================
# GAME VALIDATION TESTS
# ============================================================================

class TestGameValidation:
	"""Tests for game duration and move count validation."""

	def test_game_duration_passes_when_long_enough(self):
		"""Duration validation should pass when game is long enough."""
		duration = policy.GAME_MIN_DURATION_SECONDS + 10

		valid = policy.validate_game_duration(duration)
		assert valid is True

	def test_game_duration_fails_when_too_short(self):
		"""Duration validation should fail when game is too short."""
		duration = policy.GAME_MIN_DURATION_SECONDS - 10

		valid = policy.validate_game_duration(duration)
		assert valid is False

	def test_game_duration_passes_at_exact_minimum(self):
		"""Duration validation should pass at exactly the minimum."""
		duration = policy.GAME_MIN_DURATION_SECONDS

		valid = policy.validate_game_duration(duration)
		assert valid is True

	def test_game_moves_passes_when_enough(self):
		"""Move validation should pass when enough moves."""
		moves = policy.GAME_MIN_MOVES + 5

		valid = policy.validate_game_moves(moves)
		assert valid is True

	def test_game_moves_fails_when_too_few(self):
		"""Move validation should fail when too few moves."""
		moves = policy.GAME_MIN_MOVES - 1

		valid = policy.validate_game_moves(moves)
		assert valid is False

	def test_game_moves_passes_at_exact_minimum(self):
		"""Move validation should pass at exactly the minimum."""
		moves = policy.GAME_MIN_MOVES

		valid = policy.validate_game_moves(moves)
		assert valid is True


# ============================================================================
# ACCRUAL INTEGRATION TESTS
# ============================================================================

class TestAccrualAntiCheat:
	"""Tests for accrual module anti-cheat integration."""

	@pytest.mark.asyncio
	async def test_record_dm_respects_limit(self, fake_redis):
		"""record_dm_sent should respect daily limits."""
		accrual = LeaderboardAccrual()
		sender = "sender-123"
		recipient = "recipient-456"

		# First message should be allowed
		result = await accrual.record_dm_sent(from_user_id=sender, to_user_id=recipient)
		assert result is True

	@pytest.mark.asyncio
	async def test_record_dm_blocks_after_limit(self, fake_redis):
		"""record_dm_sent should block after limit reached."""
		accrual = LeaderboardAccrual()
		sender = "sender-123"
		recipient = "recipient-456"
		day = _day_stamp()

		# Max out the limit via policy directly
		for _ in range(policy.DMS_PER_RECIPIENT_DAILY):
			await policy.increment_dm_recipient_count(sender, recipient, day)

		# Next message should be blocked
		result = await accrual.record_dm_sent(from_user_id=sender, to_user_id=recipient)
		assert result is False

	@pytest.mark.asyncio
	async def test_record_friendship_respects_limit(self, fake_redis):
		"""record_friendship_accepted should respect daily limits."""
		accrual = LeaderboardAccrual()
		user_a = "user-a-123"
		user_b = "user-b-456"

		# First friendship should be allowed for both
		result = await accrual.record_friendship_accepted(user_a=user_a, user_b=user_b)
		assert result is True

	@pytest.mark.asyncio
	async def test_record_friendship_blocks_after_limit(self, fake_redis):
		"""record_friendship_accepted should block after limit reached."""
		accrual = LeaderboardAccrual()
		user_a = "user-a-123"
		user_b = "user-b-456"
		day = _day_stamp()

		# Max out both users' friend limits
		for _ in range(policy.FRIENDS_PER_DAY_CAP):
			await policy.increment_daily_friend_count(user_a, day)
			await policy.increment_daily_friend_count(user_b, day)

		# Next friendship should be blocked
		result = await accrual.record_friendship_accepted(user_a=user_a, user_b=user_b)
		assert result is False

	@pytest.mark.asyncio
	async def test_record_room_joined_tracks_join_time(self, fake_redis):
		"""record_room_joined should track join time."""
		accrual = LeaderboardAccrual()
		user_id = "user-123"
		room_id = "room-456"

		result = await accrual.record_room_joined(user_id=user_id, room_id=room_id)
		assert result is True

		# Verify join time was recorded
		join_time = await policy.get_meetup_join_time(user_id, room_id)
		assert join_time is not None

	@pytest.mark.asyncio
	async def test_record_room_left_awards_points_when_valid(self, fake_redis):
		"""record_room_left should award points when conditions met."""
		accrual = LeaderboardAccrual()
		user_id = "user-123"
		room_id = "room-456"

		# Simulate joining enough time ago
		join_time = _now() - timedelta(minutes=policy.MEETUP_STAY_DURATION_MINUTES + 5)
		await policy.record_meetup_join_time(user_id, room_id, now=join_time)

		# Leave with enough attendees
		result = await accrual.record_room_left(
			user_id=user_id,
			room_id=room_id,
			attendee_count=policy.MEETUP_MIN_ATTENDEES + 1
		)
		assert result is True

	@pytest.mark.asyncio
	async def test_record_room_left_no_points_when_too_short(self, fake_redis):
		"""record_room_left should not award points when stayed too briefly."""
		accrual = LeaderboardAccrual()
		user_id = "user-123"
		room_id = "room-456"

		# Simulate joining just now
		join_time = _now() - timedelta(minutes=2)  # Only 2 minutes
		await policy.record_meetup_join_time(user_id, room_id, now=join_time)

		# Leave with enough attendees
		result = await accrual.record_room_left(
			user_id=user_id,
			room_id=room_id,
			attendee_count=policy.MEETUP_MIN_ATTENDEES + 1
		)
		assert result is False

	@pytest.mark.asyncio
	async def test_record_room_left_no_points_when_too_few_attendees(self, fake_redis):
		"""record_room_left should not award points when too few attendees."""
		accrual = LeaderboardAccrual()
		user_id = "user-123"
		room_id = "room-456"

		# Simulate joining enough time ago
		join_time = _now() - timedelta(minutes=policy.MEETUP_STAY_DURATION_MINUTES + 5)
		await policy.record_meetup_join_time(user_id, room_id, now=join_time)

		# Leave with too few attendees
		result = await accrual.record_room_left(
			user_id=user_id,
			room_id=room_id,
			attendee_count=1  # Only 1 attendee
		)
		assert result is False

	@pytest.mark.asyncio
	async def test_record_activity_no_points_for_short_game(self, fake_redis):
		"""record_activity_ended should not award points for short games."""
		accrual = LeaderboardAccrual()
		user_ids = ["user-a", "user-b"]

		# Very short game
		awarded = await accrual.record_activity_ended(
			user_ids=user_ids,
			winner_id="user-a",
			duration_seconds=10,  # Too short
			move_count=10
		)
		assert len(awarded) == 0

	@pytest.mark.asyncio
	async def test_record_activity_no_points_for_few_moves(self, fake_redis):
		"""record_activity_ended should not award points for games with few moves."""
		accrual = LeaderboardAccrual()
		user_ids = ["user-a", "user-b"]

		# Game with too few moves
		awarded = await accrual.record_activity_ended(
			user_ids=user_ids,
			winner_id="user-a",
			duration_seconds=120,  # Long enough
			move_count=1  # Too few
		)
		assert len(awarded) == 0


# ============================================================================
# SERVICE LAYER INTEGRATION TESTS
# ============================================================================

class TestServiceLayerAntiCheat:
	"""Tests for service layer anti-cheat integration."""

	@pytest.mark.asyncio
	async def test_record_dm_sent_returns_bool(self, fake_redis):
		"""Service record_dm_sent should return boolean."""
		service = LeaderboardService()
		
		result = await service.record_dm_sent(
			from_user_id="sender-123",
			to_user_id="recipient-456"
		)
		assert isinstance(result, bool)

	@pytest.mark.asyncio
	async def test_record_friendship_accepted_returns_bool(self, fake_redis):
		"""Service record_friendship_accepted should return boolean."""
		service = LeaderboardService()
		
		result = await service.record_friendship_accepted(
			user_a="user-a-123",
			user_b="user-b-456"
		)
		assert isinstance(result, bool)

	@pytest.mark.asyncio
	async def test_record_room_joined_returns_bool(self, fake_redis):
		"""Service record_room_joined should return boolean."""
		service = LeaderboardService()
		
		result = await service.record_room_joined(
			user_id="user-123",
			room_id="room-456"
		)
		assert isinstance(result, bool)

	@pytest.mark.asyncio
	async def test_record_room_left_returns_bool(self, fake_redis):
		"""Service record_room_left should return boolean."""
		service = LeaderboardService()
		
		# Set up join time first
		await policy.record_meetup_join_time("user-123", "room-456", now=_now() - timedelta(minutes=15))
		
		result = await service.record_room_left(
			user_id="user-123",
			room_id="room-456",
			attendee_count=5
		)
		assert isinstance(result, bool)

	@pytest.mark.asyncio
	async def test_record_activity_outcome_returns_list(self, fake_redis):
		"""Service record_activity_outcome should return list of awarded users."""
		service = LeaderboardService()
		
		awarded = await service.record_activity_outcome(
			user_ids=["user-a", "user-b"],
			winner_id="user-a",
			duration_seconds=120,
			move_count=10
		)
		assert isinstance(awarded, list)


# ============================================================================
# EDGE CASE TESTS
# ============================================================================

class TestEdgeCases:
	"""Tests for edge cases and boundary conditions."""

	@pytest.mark.asyncio
	async def test_empty_user_ids(self, fake_redis):
		"""Empty user IDs should not cause errors."""
		accrual = LeaderboardAccrual()
		
		awarded = await accrual.record_activity_ended(
			user_ids=[],
			winner_id=None,
			duration_seconds=120,
			move_count=10
		)
		assert awarded == []

	@pytest.mark.asyncio
	async def test_none_room_id_handling(self, fake_redis):
		"""None room_id should be handled gracefully."""
		accrual = LeaderboardAccrual()
		
		# Should not raise
		result = await accrual.record_room_joined(user_id="user-123", room_id=None)
		# Without room_id, basic tracking still works
		assert result is True

	@pytest.mark.asyncio
	async def test_zero_duration_game(self, fake_redis):
		"""Zero duration games should not award points."""
		valid = policy.validate_game_duration(0)
		assert valid is False

	@pytest.mark.asyncio
	async def test_zero_moves_game(self, fake_redis):
		"""Zero move games should not award points."""
		valid = policy.validate_game_moves(0)
		assert valid is False

	@pytest.mark.asyncio
	async def test_negative_attendee_count(self, fake_redis):
		"""Negative attendee count should not award points."""
		accrual = LeaderboardAccrual()
		
		# Set up valid join time
		await policy.record_meetup_join_time("user-123", "room-456", now=_now() - timedelta(minutes=20))
		
		result = await accrual.record_room_left(
			user_id="user-123",
			room_id="room-456",
			attendee_count=-1  # Invalid
		)
		assert result is False

	@pytest.mark.asyncio
	async def test_same_user_dm_self(self, fake_redis):
		"""DM to self should still track (chat service validates this)."""
		# Policy doesn't prevent self-DM, but limits still apply
		sender = "user-123"
		day = _day_stamp()
		
		# Should work technically
		allowed = await policy.check_dm_recipient_limit(sender, sender, day)
		assert allowed is True
