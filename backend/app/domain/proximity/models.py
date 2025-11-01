"""Domain models used by the proximity service."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Literal

from app.infra.auth import AuthenticatedUser


Visibility = Literal["everyone", "friends", "none"]


@dataclass(slots=True)
class PrivacySettings:
	"""Privacy preferences persisted on the user record."""

	visibility: Visibility = "everyone"
	blur_distance_m: int = 0
	ghost_mode: bool = False

	def allows_visibility(self, is_friend: bool) -> bool:
		if self.ghost_mode:
			return False
		if self.visibility == "none":
			return False
		if self.visibility == "friends" and not is_friend:
			return False
		return True


@dataclass(slots=True)
class FriendStatus:
	user_id: str
	is_friend: bool
	is_blocked: bool
