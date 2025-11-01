"""Domain models backing search & discovery results."""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Optional


@dataclass(slots=True)
class UserCandidate:
	"""Normalized representation of a user returned from the repository layer."""

	user_id: str
	handle: str
	display_name: str
	campus_id: str
	avatar_url: Optional[str] = None
	visibility: str = "everyone"
	ghost_mode: bool = False
	is_friend: bool = False
	mutual_count: int = 0
	similarity_handle: float = 0.0
	similarity_display: float = 0.0
	prefix_handle: bool = False
	prefix_display: bool = False
	blocked: bool = False
	exact_match: bool = False
	recent_weight: float = 0.0
	nearby_weight: float = 0.0
	score_hint: Optional[float] = None

	def prefix_hit(self) -> bool:
		return self.prefix_handle or self.prefix_display


@dataclass(slots=True)
class RoomCandidate:
	"""Normalized representation of a room returned from the repository layer."""

	room_id: str
	name: str
	preset: str
	campus_id: str
	visibility: str = "link"
	members_count: int = 0
	messages_24h: int = 0
	overlap_count: int = 0
	score_hint: Optional[float] = None


@dataclass(slots=True)
class BlockPair:
	"""Represents a directional block relationship (blocker -> blocked)."""

	blocker_id: str
	target_id: str


@dataclass(slots=True)
class MemoryUser(UserCandidate):
	"""In-memory seed structure used by tests."""

	last_seen_ts: Optional[float] = None
	location_bucket: Optional[str] = None


@dataclass(slots=True)
class MemoryRoom(RoomCandidate):
	"""In-memory seed structure for room discovery calculations."""

	member_ids: set[str] = field(default_factory=set)
