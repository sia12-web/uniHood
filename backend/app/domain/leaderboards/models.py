"""Domain models for Phase 6 leaderboards & streaks."""

from __future__ import annotations

from dataclasses import dataclass, field
from enum import Enum
from typing import Any, Mapping, MutableMapping, Optional
from uuid import UUID


class LeaderboardScope(str, Enum):
	"""Scopes of leaderboard pillars."""

	OVERALL = "overall"
	SOCIAL = "social"
	ENGAGEMENT = "engagement"
	POPULARITY = "popularity"


class LeaderboardPeriod(str, Enum):
	"""Supported leaderboard periods."""

	DAILY = "daily"
	WEEKLY = "weekly"
	MONTHLY = "monthly"


@dataclass(slots=True)
class DailyCounters:
	"""Per-user counters aggregated over a single day."""

	invites_accepted: int = 0
	friends_new: int = 0
	dm_sent: float = 0.0
	room_sent: float = 0.0
	acts_played: int = 0
	acts_won: int = 0
	rooms_joined: int = 0
	rooms_created: int = 0
	uniq_senders: int = 0
	uniq_invite_accept_from: int = 0
	friends_removed: int = 0
	touched: int = 0

	@classmethod
	def from_mapping(cls, mapping: Mapping[str, Any]) -> "DailyCounters":
		"""Construct counters from a Redis hash mapping."""

		def _get_int(name: str) -> int:
			raw = mapping.get(name, 0)
			if raw is None:
				return 0
			try:
				return int(float(raw))
			except (TypeError, ValueError):  # pragma: no cover - defensive
				return 0

		def _get_float(name: str) -> float:
			raw = mapping.get(name, 0.0)
			if raw is None:
				return 0.0
			try:
				return float(raw)
			except (TypeError, ValueError):  # pragma: no cover - defensive
				return 0.0

		return cls(
			invites_accepted=_get_int("invites_accepted"),
			friends_new=_get_int("friends_new"),
			dm_sent=_get_float("dm_sent"),
			room_sent=_get_float("room_sent"),
			acts_played=_get_int("acts_played"),
			acts_won=_get_int("acts_won"),
			rooms_joined=_get_int("rooms_joined"),
			rooms_created=_get_int("rooms_created"),
			uniq_senders=_get_int("uniq_senders"),
			uniq_invite_accept_from=_get_int("uniq_invite_accept_from"),
			friends_removed=_get_int("friends_removed"),
			touched=_get_int("touched"),
		)

	def to_mapping(self) -> MutableMapping[str, float | int]:
		"""Serialise counters back into a mapping suitable for HSET."""

		return {
			"invites_accepted": self.invites_accepted,
			"friends_new": self.friends_new,
			"dm_sent": round(self.dm_sent, 4),
			"room_sent": round(self.room_sent, 4),
			"acts_played": self.acts_played,
			"acts_won": self.acts_won,
			"rooms_joined": self.rooms_joined,
			"rooms_created": self.rooms_created,
			"uniq_senders": self.uniq_senders,
			"uniq_invite_accept_from": self.uniq_invite_accept_from,
			"friends_removed": self.friends_removed,
			"touched": self.touched,
		}


@dataclass(slots=True)
class ScoreBreakdown:
	"""Computed pillar scores with multiplier context."""

	social: float
	engagement: float
	popularity: float
	overall_raw: float
	streak_multiplier: float
	overall: float


@dataclass(slots=True)
class LeaderboardRow:
	"""Row for leaderboard ranking."""

	rank: int
	user_id: UUID
	score: float


@dataclass(slots=True)
class StreakState:
	"""Represents a user's streak values."""

	user_id: UUID
	current: int
	best: int
	last_active_ymd: int

	@classmethod
	def empty(cls, user_id: UUID) -> "StreakState":
		return cls(user_id=user_id, current=0, best=0, last_active_ymd=0)


@dataclass(slots=True)
class BadgeRecord:
	"""Badge record stored in Postgres."""

	id: UUID
	user_id: UUID
	kind: str
	earned_ymd: int
	meta: dict[str, Any] = field(default_factory=dict)


@dataclass(slots=True)
class LeaderboardSnapshot:
	"""Snapshot persisted for a specific day & campus."""

	ymd: int
	campus_id: UUID
	user_id: UUID
	scores: ScoreBreakdown
	rank_overall: Optional[int] = None
