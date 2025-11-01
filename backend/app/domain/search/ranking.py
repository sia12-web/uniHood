# Ranking logic for search
"""Ranking helpers shared by Search & Discovery flows."""

from __future__ import annotations

import math


MAX_USER_SCORE = 1.5


def clamp(value: float, *, lower: float = 0.0, upper: float = MAX_USER_SCORE) -> float:
	return max(lower, min(upper, value))


def user_search_score(
	similarity_handle: float,
	similarity_display: float,
	prefix_hit: bool,
	is_friend: bool,
	mutual_count: int,
) -> float:
	"""Compute the blended search score for a user candidate."""

	s_text = max(similarity_handle, similarity_display)
	s_prefix = 1.0 if prefix_hit else 0.0
	s_friend = 1.0 if is_friend else 0.0
	s_mutual = math.log1p(max(mutual_count, 0)) / 4.0
	score = 0.7 * s_text + 0.2 * s_prefix + 0.1 * s_friend + 0.1 * s_mutual
	return clamp(score)


def discover_people_score(mutual_count: int, recent_weight: float, nearby_weight: float) -> float:
	"""Score for people discovery feed."""

	s_mutual = math.log1p(max(mutual_count, 0))
	s_recent = max(0.0, min(recent_weight, 0.4))
	s_nearby = max(0.0, min(nearby_weight, 0.2))
	return 0.6 * s_mutual + 0.3 * s_recent + 0.1 * s_nearby


def discover_room_score(messages_24h: int, members_count: int, overlap_count: int) -> float:
	"""Score for room discovery results."""

	s_trend = math.log1p(max(messages_24h, 0))
	s_size = math.log1p(max(members_count, 0))
	s_aff = math.log1p(max(overlap_count, 0)) * 0.5
	return 0.6 * s_trend + 0.3 * s_size + 0.1 * s_aff
