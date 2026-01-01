"""Domain models for Campus XP."""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime
from enum import Enum
from typing import Any, Mapping
from uuid import UUID

@dataclass
class UserXPStats:
    user_id: UUID
    total_xp: int
    current_level: int
    last_updated_at: datetime
    
    @property
    def level_label(self) -> str:
        return LEVEL_LABELS.get(self.current_level, "Unknown")
        
    @property
    def next_level_xp(self) -> int | None:
        return LEVEL_THRESHOLDS.get(self.current_level + 1)
        
    @property
    def progress_percent(self) -> float:
        """Calculate progress to next level (0.0 to 1.0)."""
        current_threshold = LEVEL_THRESHOLDS.get(self.current_level, 0)
        next_threshold = LEVEL_THRESHOLDS.get(self.current_level + 1)
        
        if next_threshold is None:
            return 1.0  # Max level
            
        needed = next_threshold - current_threshold
        earned_in_level = self.total_xp - current_threshold
        
        return max(0.0, min(1.0, earned_in_level / needed))


@dataclass
class XPEvent:
    id: UUID
    user_id: UUID
    action_type: str
    amount: int
    metadata: dict[str, Any]
    created_at: datetime


# Constants
LEVEL_THRESHOLDS = {
    1: 0,
    2: 100,
    3: 500,
    4: 1500,
    5: 5000,
    6: 15000,
}

LEVEL_LABELS = {
    1: "Newcomer",
    2: "Explorer",
    3: "Connector",
    4: "Verified Resident",
    5: "Social Leader",
    6: "Campus Icon",
}

class XPAction(str, Enum):
    CHAT_SENT = "chat_sent"
    MEETUP_JOIN = "meetup_join"
    MEETUP_HOST = "meetup_host"
    GAME_PLAYED = "game_played"
    GAME_WON = "game_won"
    PROFILE_UPDATE = "profile_update"
    DAILY_LOGIN = "daily_login"
    FRIEND_INVITE_SENT = "friend_invite_sent"
    FRIEND_REQUEST_ACCEPTED = "friend_request_accepted"
    DISCOVERY_SWIPE = "discovery_swipe"
    DISCOVERY_MATCH = "discovery_match"
    FRIEND_REMOVED = "friend_removed"

XP_AMOUNTS = {
    XPAction.CHAT_SENT: 0,
    XPAction.MEETUP_JOIN: 50,
    XPAction.MEETUP_HOST: 100,
    XPAction.GAME_PLAYED: 50,
    XPAction.GAME_WON: 150,
    XPAction.PROFILE_UPDATE: 15,
    XPAction.DAILY_LOGIN: 25,
    XPAction.FRIEND_INVITE_SENT: 10,
    XPAction.FRIEND_REQUEST_ACCEPTED: 50,
    XPAction.DISCOVERY_SWIPE: 2,
    XPAction.DISCOVERY_MATCH: 15,
    XPAction.FRIEND_REMOVED: -50,
}
