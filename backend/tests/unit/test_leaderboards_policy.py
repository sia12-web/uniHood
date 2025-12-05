import math
from datetime import datetime, timedelta, timezone

import pytest

from app.domain.leaderboards import policy
from app.domain.leaderboards.models import DailyCounters
from app.domain.leaderboards.service import LeaderboardService


@pytest.mark.asyncio
async def test_register_burst_and_mute_triggers(fake_redis):
	user_id = "user-123"
	base = datetime(2025, 10, 24, 12, 0, tzinfo=timezone.utc)

	muted = False
	for idx in range(policy.BURST_RPS_THRESHOLD * policy.BURST_WINDOW_SECONDS):
		now = base + timedelta(milliseconds=100 * idx)
		muted = await policy.register_burst_and_mute(user_id, "dm", now=now)
		assert muted is False

	muted = await policy.register_burst_and_mute(user_id, "dm", now=base + timedelta(seconds=9, milliseconds=900))
	assert muted is True
	assert await policy.is_muted(user_id, "dm") is True


@pytest.mark.asyncio
async def test_register_burst_clears_after_expiry(fake_redis):
	user_id = "user-456"
	base = datetime(2025, 10, 24, 12, 0, tzinfo=timezone.utc)
	final_call = base + timedelta(seconds=9)

	for idx in range(policy.BURST_RPS_THRESHOLD * policy.BURST_WINDOW_SECONDS + 1):
		now = base + timedelta(milliseconds=100 * idx)
		await policy.register_burst_and_mute(user_id, "room_chat", now=now)

	assert await policy.is_muted(user_id, "room_chat") is True
	await fake_redis.delete(f"lb:muted:room_chat:{user_id}")
	assert await policy.is_muted(user_id, "room_chat") is False
	assert await policy.register_burst_and_mute(user_id, "room_chat", now=final_call + timedelta(seconds=11)) is False


def test_clamp_and_score_formula():
	counters = DailyCounters(
		invites_accepted=2,
		friends_new=1,
		dm_sent=120,
		room_sent=90,
		acts_played=3,
		acts_won=1,
		rooms_joined=10,
		rooms_created=5,
		uniq_senders=25,
		uniq_invite_accept_from=12,
		touched=1,
	)
	service = LeaderboardService()
	scores = service._score_for_user(counters, streak_days=15)

	assert counters.dm_sent == policy.DM_SENT_CAP
	assert counters.room_sent == policy.ROOM_SENT_CAP
	assert counters.rooms_joined == policy.ROOM_JOIN_CAP
	assert counters.rooms_created == policy.ROOM_CREATE_CAP
	assert counters.uniq_senders == policy.UNIQ_SENDER_CAP
	assert counters.uniq_invite_accept_from == policy.UNIQ_INVITE_CAP

	# Calculate expected values based on current weights:
	# social = W_INVITE_ACCEPT*2 + W_FRIEND_NEW*1 + W_DM_SENT*50 + W_ROOM_SENT*50
	#        = 30*2 + 50*1 + 2*50 + 1*50 = 60 + 50 + 100 + 50 = 260
	# engagement = W_ACT_PLAYED*3 + W_ACT_WON*1 + W_ROOM_JOIN*10 + W_ROOM_CREATE*3
	#            = 50*3 + 150*1 + 30*10 + 100*3 = 150 + 150 + 300 + 300 = 900
	# popularity = W_POP_UNIQ_SENDER*20 + W_POP_UNIQ_INVITE_FROM*10
	#            = 10*20 + 20*10 = 200 + 200 = 400
	expected_social = (
		policy.W_INVITE_ACCEPT * 2 
		+ policy.W_FRIEND_NEW * min(1, policy.FRIENDS_PER_DAY_CAP)
		+ policy.W_DM_SENT * policy.DM_SENT_CAP 
		+ policy.W_ROOM_SENT * policy.ROOM_SENT_CAP
	)
	expected_engagement = (
		policy.W_ACT_PLAYED * 3 
		+ policy.W_ACT_WON * 1 
		+ policy.W_ROOM_JOIN * policy.ROOM_JOIN_CAP 
		+ policy.W_ROOM_CREATE * policy.ROOM_CREATE_CAP
	)
	expected_popularity = (
		policy.W_POP_UNIQ_SENDER * policy.UNIQ_SENDER_CAP 
		+ policy.W_POP_UNIQ_INVITE_FROM * policy.UNIQ_INVITE_CAP
	)
	expected_overall_raw = expected_social + expected_engagement + expected_popularity

	assert math.isclose(scores.social, expected_social, rel_tol=1e-6)
	assert math.isclose(scores.engagement, expected_engagement, rel_tol=1e-6)
	assert math.isclose(scores.popularity, expected_popularity, rel_tol=1e-6)
	assert math.isclose(scores.overall_raw, expected_overall_raw, rel_tol=1e-6)
	assert math.isclose(scores.streak_multiplier, 1.24137931, rel_tol=1e-6)
	assert math.isclose(scores.overall, expected_overall_raw * scores.streak_multiplier, rel_tol=1e-6)


def test_streak_multiplier_curve():
	assert policy.streak_multiplier(0) == pytest.approx(policy.STREAK_MULT_MIN)
	assert policy.streak_multiplier(1) == pytest.approx(1.0)
	assert policy.streak_multiplier(30) == pytest.approx(policy.STREAK_MULT_MAX)
	mid = policy.streak_multiplier(15)
	expected = 1.0 + (policy.STREAK_MULT_MAX - policy.STREAK_MULT_MIN) * 14 / 29
	assert mid == pytest.approx(expected)
