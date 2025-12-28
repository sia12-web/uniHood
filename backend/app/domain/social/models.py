"""Domain models for invites and friendships."""

from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime
from enum import Enum
from typing import Optional
from uuid import UUID


class InvitationStatus(str, Enum):
	"""Supported invitation statuses."""

	SENT = "sent"
	ACCEPTED = "accepted"
	DECLINED = "declined"
	CANCELLED = "cancelled"
	EXPIRED = "expired"


class FriendshipStatus(str, Enum):
	"""Friendship states tracked in the database."""

	PENDING = "pending"
	ACCEPTED = "accepted"
	BLOCKED = "blocked"


INVITE_EXPIRES_DAYS = 7
INVITE_PER_MINUTE = 15
INVITE_PER_DAY = 200  # Global fallback
BLOCK_PER_MINUTE = 10

# Daily invitation limits based on Social Level
LEVEL_INVITE_LIMITS = {
	1: 5,
	2: 10,
	3: 20,
	4: 50,
	5: 100,
	6: 500,  # Effectively unlimited for highest tier but with a safety cap
}


@dataclass(slots=True)
class Invitation:
	"""Represents a directional invite."""

	id: UUID
	from_user_id: UUID
	to_user_id: UUID
	campus_id: Optional[UUID]
	status: InvitationStatus
	created_at: datetime
	updated_at: datetime
	expires_at: datetime

	@classmethod
	def from_record(cls, record: dict) -> "Invitation":
		return cls(
			id=UUID(str(record["id"])),
			from_user_id=UUID(str(record["from_user_id"])),
			to_user_id=UUID(str(record["to_user_id"])),
			campus_id=UUID(str(record["campus_id"])) if record.get("campus_id") else None,
			status=InvitationStatus(record["status"]),
			created_at=record["created_at"],
			updated_at=record["updated_at"],
			expires_at=record["expires_at"],
		)


@dataclass(slots=True)
class Friendship:
	"""Represents the directional relationship between two users."""

	user_id: UUID
	friend_id: UUID
	status: FriendshipStatus
	created_at: datetime
	updated_at: datetime

	@classmethod
	def from_record(cls, record: dict) -> "Friendship":
		return cls(
			user_id=UUID(str(record["user_id"])),
			friend_id=UUID(str(record["friend_id"])),
			status=FriendshipStatus(record["status"]),
			created_at=record["created_at"],
			updated_at=record["updated_at"],
		)
