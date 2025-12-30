"""Policy helpers for leaderboards & streaks."""

from __future__ import annotations

from datetime import datetime
import uuid

from app.domain.leaderboards.models import DailyCounters
from app.infra.redis import redis_client


# --- Social Score Weights ---
# Points earned for social activities (these accumulate to increase Social Score level)

# Friends Category
W_INVITE_ACCEPT = 30.0   # Accepting a friend invite
W_FRIEND_NEW = 50.0      # Making a new friend
W_FRIEND_REMOVED = -50.0 # Losing a friend
W_INVITE_SENT = 10.0     # Sending a friend invite
W_DM_SENT = 2.0          # Sending a direct message (capped)
W_ROOM_SENT = 1.0        # Sending a message in a room (capped)

# Meetups/Rooms Category  
W_ROOM_JOIN = 30.0       # Joining a room/meetup
W_ROOM_CREATE = 100.0    # Creating/hosting a meetup

# Discovery Category
W_DISCOVERY_SWIPE = 2.0    # Swiping on a profile
W_DISCOVERY_MATCH = 15.0   # Matching with someone

# Games Category (separate from social, tracked as Game Points)
W_ACT_PLAYED = 50.0      # Playing a game
W_ACT_WON = 150.0        # Winning a game

# Popularity (bonus points)
W_POP_UNIQ_SENDER = 10.0       # Unique people messaging you
W_POP_UNIQ_INVITE_FROM = 20.0  # Unique people accepting your invites

# Caps to prevent gaming
DM_SENT_CAP = 50.0       # Max DMs counted per day
ROOM_SENT_CAP = 50.0     # Max room messages counted per day
ROOM_JOIN_CAP = 10       # Max room joins counted per day
ROOM_CREATE_CAP = 3      # Max room creations counted per day
UNIQ_SENDER_CAP = 20     # Max unique senders counted
UNIQ_INVITE_CAP = 10     # Max unique invite accepters counted

# ============================================================================
# SOCIAL SCORE TIER SYSTEM
# Social Score is a LEVEL (1, 2, 3, etc.) that increases as you earn points
# The leaderboard ranks users by their Social Score level
# ============================================================================

# Thresholds: cumulative points needed to reach each Social Score level
# Social Score 1: 0-99 points
# Social Score 2: 100-299 points
# Social Score 3: 300-599 points
# etc.
SOCIAL_SCORE_THRESHOLDS = [
    0,      # Level 1: 0+ points
    100,    # Level 2: 100+ points
    300,    # Level 3: 300+ points
    600,    # Level 4: 600+ points
    1000,   # Level 5: 1000+ points
    1500,   # Level 6: 1500+ points
    2100,   # Level 7: 2100+ points
    2800,   # Level 8: 2800+ points
    3600,   # Level 9: 3600+ points
    4500,   # Level 10: 4500+ points
    5500,   # Level 11: 5500+ points
    6600,   # Level 12: 6600+ points
    7800,   # Level 13: 7800+ points
    9100,   # Level 14: 9100+ points
    10500,  # Level 15: 10500+ points (max visible level, continues beyond)
]


def calculate_social_score_level(total_points: float) -> int:
    """
    Calculate the Social Score level based on accumulated points.
    Returns a level (1, 2, 3, etc.) - the higher the better.
    """
    level = 1
    for i, threshold in enumerate(SOCIAL_SCORE_THRESHOLDS):
        if total_points >= threshold:
            level = i + 1
        else:
            break
    # Allow levels beyond the defined thresholds
    if total_points >= SOCIAL_SCORE_THRESHOLDS[-1]:
        # Each additional 1500 points after max threshold = +1 level
        extra_points = total_points - SOCIAL_SCORE_THRESHOLDS[-1]
        extra_levels = int(extra_points // 1500)
        level = len(SOCIAL_SCORE_THRESHOLDS) + extra_levels
    return level


def points_to_next_level(total_points: float) -> tuple[int, float]:
    """
    Calculate points needed to reach next Social Score level.
    Returns (next_level, points_needed).
    """
    current_level = calculate_social_score_level(total_points)
    
    if current_level < len(SOCIAL_SCORE_THRESHOLDS):
        next_threshold = SOCIAL_SCORE_THRESHOLDS[current_level]
        return current_level + 1, next_threshold - total_points
    else:
        # Beyond defined thresholds, each level needs 1500 points
        base = SOCIAL_SCORE_THRESHOLDS[-1]
        levels_beyond = current_level - len(SOCIAL_SCORE_THRESHOLDS)
        current_threshold = base + (levels_beyond * 1500)
        next_threshold = current_threshold + 1500
        return current_level + 1, next_threshold - total_points

# ============================================================================
# ANTI-CHEAT CONFIGURATION
# ============================================================================

# --- Per-opponent/per-user daily limits ---
# Prevents farming points from the same person repeatedly
GAMES_PER_OPPONENT_DAILY = 2       # Max games with same opponent that count per day
DMS_PER_RECIPIENT_DAILY = 10       # Max DMs to same person that count per day
FRIENDS_PER_DAY_CAP = 10           # Max new friends that count per day (prevents mass fake accounts)

# --- Cooldowns between repeated actions (seconds) ---
GAME_OPPONENT_COOLDOWN = 1800      # 30 min cooldown between scoring games with same opponent
DM_RECIPIENT_COOLDOWN = 300        # 5 min cooldown between scoring DMs to same person
MEETUP_JOIN_COOLDOWN = 3600        # 1 hour cooldown for rejoining same meetup

# --- Meetup validation requirements ---
MEETUP_MIN_DURATION_MINUTES = 15   # Meetup must last 15+ mins for join points
MEETUP_MIN_ATTENDEES = 2           # Minimum attendees for meetup to count (including host)
MEETUP_CANCEL_PENALTY_WINDOW = 300 # 5 min - if cancelled within this, no points & possible penalty
MEETUP_STAY_DURATION_MINUTES = 10  # Must stay 10+ mins in meetup to get join points

# --- Game validation requirements ---
GAME_MIN_DURATION_SECONDS = 30     # Game must last 30+ seconds
GAME_MIN_MOVES = 3                 # Minimum moves/actions in game

# --- Friendship validation ---
FRIEND_MIN_ACCOUNT_AGE_HOURS = 24  # New account must be 24h+ old before friend points count
FRIEND_SAME_IP_BLOCKED = True      # Block points for friends from same IP (anti-sockpuppet)

# --- Fraud detection thresholds ---
WIN_TRADE_DETECTION_WINDOW = 7     # Days to look back for win-trading patterns
WIN_TRADE_ALTERNATION_THRESHOLD = 4  # A beats B, B beats A alternating X times = suspicious
RAPID_JOIN_LEAVE_THRESHOLD = 3     # Join-leave same meetup X times in a day = suspicious
CREATE_CANCEL_RATIO_THRESHOLD = 0.5  # If >50% meetups cancelled = suspicious

# ============================================================================

STREAK_MULT_MIN = 1.0
STREAK_MULT_MAX = 1.5
STREAK_AT_30 = 30


# --- Anti-gaming configuration ---
BURST_RPS_THRESHOLD = 5  # messages per second
BURST_WINDOW_SECONDS = 10
MUTED_TTL_SECONDS = 10

# TTL for anti-cheat tracking keys
ANTICHEAT_TTL_SECONDS = 86400  # 24 hours


def clamp_daily_counters(counters: DailyCounters) -> DailyCounters:
	"""Apply policy caps to a set of counters."""

	counters.dm_sent = min(counters.dm_sent, DM_SENT_CAP)
	counters.room_sent = min(counters.room_sent, ROOM_SENT_CAP)
	counters.rooms_joined = min(counters.rooms_joined, ROOM_JOIN_CAP)
	counters.rooms_created = min(counters.rooms_created, ROOM_CREATE_CAP)
	counters.uniq_senders = min(counters.uniq_senders, UNIQ_SENDER_CAP)
	counters.uniq_invite_accept_from = min(counters.uniq_invite_accept_from, UNIQ_INVITE_CAP)
	# Apply new friend cap
	counters.friends_new = min(counters.friends_new, FRIENDS_PER_DAY_CAP)
	return counters


# ============================================================================
# ANTI-CHEAT VALIDATION FUNCTIONS
# ============================================================================

async def check_game_opponent_limit(user_id: str, opponent_id: str, day: str) -> bool:
	"""
	Check if user can earn points from game with this opponent today.
	Returns True if allowed, False if limit exceeded.
	"""
	# Sort IDs to ensure consistent key regardless of who is "user" vs "opponent"
	pair_key = ":".join(sorted([user_id, opponent_id]))
	key = f"ac:game_pair:{day}:{pair_key}"
	
	count = await redis_client.get(key)
	current = int(count) if count else 0
	
	return current < GAMES_PER_OPPONENT_DAILY


async def increment_game_opponent_count(user_id: str, opponent_id: str, day: str) -> None:
	"""Record a game between two users for daily limit tracking."""
	pair_key = ":".join(sorted([user_id, opponent_id]))
	key = f"ac:game_pair:{day}:{pair_key}"
	
	await redis_client.incr(key)
	await redis_client.expire(key, ANTICHEAT_TTL_SECONDS)


async def check_game_opponent_cooldown(user_id: str, opponent_id: str) -> bool:
	"""
	Check if cooldown has passed since last game with this opponent.
	Returns True if allowed, False if still in cooldown.
	"""
	pair_key = ":".join(sorted([user_id, opponent_id]))
	key = f"ac:game_cd:{pair_key}"
	
	exists = await redis_client.exists(key)
	return not exists


async def set_game_opponent_cooldown(user_id: str, opponent_id: str) -> None:
	"""Set cooldown after a game between two users."""
	pair_key = ":".join(sorted([user_id, opponent_id]))
	key = f"ac:game_cd:{pair_key}"
	
	await redis_client.setex(key, GAME_OPPONENT_COOLDOWN, "1")


async def check_dm_recipient_limit(from_user: str, to_user: str, day: str) -> bool:
	"""
	Check if user can earn points from DM to this recipient today.
	Returns True if allowed, False if limit exceeded.
	"""
	key = f"ac:dm_pair:{day}:{from_user}:{to_user}"
	
	count = await redis_client.get(key)
	current = int(count) if count else 0
	
	return current < DMS_PER_RECIPIENT_DAILY


async def increment_dm_recipient_count(from_user: str, to_user: str, day: str) -> None:
	"""Record a DM for daily limit tracking."""
	key = f"ac:dm_pair:{day}:{from_user}:{to_user}"
	
	await redis_client.incr(key)
	await redis_client.expire(key, ANTICHEAT_TTL_SECONDS)


async def check_dm_recipient_cooldown(from_user: str, to_user: str) -> bool:
	"""
	Check if cooldown has passed since last DM to this recipient.
	Returns True if allowed, False if still in cooldown.
	"""
	key = f"ac:dm_cd:{from_user}:{to_user}"
	
	exists = await redis_client.exists(key)
	return not exists


async def set_dm_recipient_cooldown(from_user: str, to_user: str) -> None:
	"""Set cooldown after DM to recipient."""
	key = f"ac:dm_cd:{from_user}:{to_user}"
	
	await redis_client.setex(key, DM_RECIPIENT_COOLDOWN, "1")


async def check_meetup_join_cooldown(user_id: str, meetup_id: str) -> bool:
	"""
	Check if user can rejoin this meetup (cooldown-based).
	Returns True if allowed, False if still in cooldown.
	"""
	key = f"ac:meetup_cd:{user_id}:{meetup_id}"
	
	exists = await redis_client.exists(key)
	return not exists


async def set_meetup_join_cooldown(user_id: str, meetup_id: str) -> None:
	"""Set cooldown after joining a meetup."""
	key = f"ac:meetup_cd:{user_id}:{meetup_id}"
	
	await redis_client.setex(key, MEETUP_JOIN_COOLDOWN, "1")


async def record_meetup_join_time(user_id: str, meetup_id: str, *, now: datetime) -> None:
	"""Record when user joined a meetup for duration validation."""
	key = f"ac:meetup_join:{user_id}:{meetup_id}"
	
	await redis_client.setex(key, ANTICHEAT_TTL_SECONDS, str(now.timestamp()))


async def get_meetup_join_time(user_id: str, meetup_id: str) -> float | None:
	"""Get timestamp when user joined meetup, or None if not found."""
	key = f"ac:meetup_join:{user_id}:{meetup_id}"
	
	value = await redis_client.get(key)
	if value:
		return float(value)
	return None


async def check_meetup_stay_duration(user_id: str, meetup_id: str, *, now: datetime) -> bool:
	"""
	Check if user stayed in meetup long enough to earn points.
	Returns True if stayed long enough, False otherwise.
	"""
	join_time = await get_meetup_join_time(user_id, meetup_id)
	if join_time is None:
		return False
	
	duration_minutes = (now.timestamp() - join_time) / 60
	return duration_minutes >= MEETUP_STAY_DURATION_MINUTES


async def record_meetup_creation(user_id: str, meetup_id: str, *, now: datetime) -> None:
	"""Record meetup creation for cancel tracking."""
	key = f"ac:meetup_created:{meetup_id}"
	
	await redis_client.hset(key, mapping={
		"host_id": user_id,
		"created_at": str(now.timestamp()),
	})
	await redis_client.expire(key, ANTICHEAT_TTL_SECONDS)


async def check_meetup_cancel_penalty(meetup_id: str, *, now: datetime) -> bool:
	"""
	Check if cancelling this meetup should result in no points (and potential penalty).
	Returns True if penalty applies (cancelled too quickly), False otherwise.
	"""
	key = f"ac:meetup_created:{meetup_id}"
	
	data = await redis_client.hgetall(key)
	if not data or "created_at" not in data:
		return False
	
	created_at = float(data["created_at"])
	elapsed = now.timestamp() - created_at
	
	return elapsed < MEETUP_CANCEL_PENALTY_WINDOW


async def track_rapid_join_leave(user_id: str, meetup_id: str, day: str) -> int:
	"""
	Track join-leave patterns for fraud detection.
	Returns the count of join-leaves for this meetup today.
	"""
	key = f"ac:joinleave:{day}:{user_id}:{meetup_id}"
	
	count = await redis_client.incr(key)
	await redis_client.expire(key, ANTICHEAT_TTL_SECONDS)
	
	return count


async def is_suspicious_join_leave(user_id: str, meetup_id: str, day: str) -> bool:
	"""Check if user has suspicious join-leave pattern for this meetup."""
	key = f"ac:joinleave:{day}:{user_id}:{meetup_id}"
	
	count = await redis_client.get(key)
	current = int(count) if count else 0
	
	return current >= RAPID_JOIN_LEAVE_THRESHOLD


async def check_daily_friend_limit(user_id: str, day: str) -> bool:
	"""
	Check if user can earn points from new friends today.
	Returns True if allowed, False if limit exceeded.
	"""
	key = f"ac:friends_daily:{day}:{user_id}"
	
	count = await redis_client.get(key)
	current = int(count) if count else 0
	
	return current < FRIENDS_PER_DAY_CAP


async def increment_daily_friend_count(user_id: str, day: str) -> None:
	"""Record a new friendship for daily limit tracking."""
	key = f"ac:friends_daily:{day}:{user_id}"
	
	await redis_client.incr(key)
	await redis_client.expire(key, ANTICHEAT_TTL_SECONDS)


def validate_game_duration(duration_seconds: int) -> bool:
	"""Check if game duration meets minimum requirement."""
	return duration_seconds >= GAME_MIN_DURATION_SECONDS


def validate_game_moves(move_count: int) -> bool:
	"""Check if game has minimum number of moves."""
	return move_count >= GAME_MIN_MOVES


def streak_multiplier(days_active: int) -> float:
	"""Compute streak multiplier per spec (linear 1.0→1.5 across 1..30)."""

	if days_active <= 1:
		return STREAK_MULT_MIN
	if days_active >= STREAK_AT_30:
		return STREAK_MULT_MAX
	span = STREAK_AT_30 - 1
	progress = max(days_active - 1, 0) / span
	return STREAK_MULT_MIN + (STREAK_MULT_MAX - STREAK_MULT_MIN) * progress


async def is_muted(user_id: str, channel: str) -> bool:
	"""Return True when the user is muted for leaderboard accrual."""

	mute_key = f"lb:muted:{channel}:{user_id}"
	ttl = await redis_client.ttl(mute_key)
	if ttl is None:
		return False
	if ttl < 0:
		return False
	return ttl > 0


async def register_burst_and_mute(user_id: str, channel: str, *, now: datetime) -> bool:
	"""Record a message event and mute user if >5 rps for >10s."""

	if await is_muted(user_id, channel):
		return True

	key = f"lb:burst:{channel}:{user_id}"
	score = now.timestamp()
	member = f"{score}:{uuid.uuid4().hex}"
	await redis_client.zadd(key, {member: score})
	window_start = score - BURST_WINDOW_SECONDS
	await redis_client.zremrangebyscore(key, 0, window_start)
	await redis_client.expire(key, BURST_WINDOW_SECONDS * 2)

	event_count = await redis_client.zcount(key, window_start, score)
	threshold = BURST_RPS_THRESHOLD * BURST_WINDOW_SECONDS
	if event_count > threshold:
		mute_key = f"lb:muted:{channel}:{user_id}"
		await redis_client.setex(mute_key, MUTED_TTL_SECONDS, "1")
		return True
	return False
