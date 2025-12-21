from __future__ import annotations

from datetime import datetime
from enum import Enum
from typing import List, Optional
from uuid import UUID

from pydantic import BaseModel, Field


class MeetupStatus(str, Enum):
    UPCOMING = "UPCOMING"
    ACTIVE = "ACTIVE"
    ENDED = "ENDED"
    CANCELLED = "CANCELLED"


class MeetupRole(str, Enum):
    HOST = "HOST"
    PARTICIPANT = "PARTICIPANT"


class MeetupCategory(str, Enum):
    STUDY = "study"
    SOCIAL = "social"
    GAME = "game"
    GYM = "gym"
    FOOD = "food"
    OTHER = "other"



class MeetupVisibility(str, Enum):
    GLOBAL = "GLOBAL"
    PRIVATE = "PRIVATE"


class MeetupParticipantStatus(str, Enum):
    JOINED = "JOINED"
    LEFT = "LEFT"


class MeetupParticipant(BaseModel):
    user_id: UUID
    role: MeetupRole
    status: MeetupParticipantStatus
    joined_at: datetime
    left_at: Optional[datetime] = None
    display_name: Optional[str] = None
    avatar_url: Optional[str] = None


class MeetupCreateRequest(BaseModel):
    title: str = Field(..., min_length=3, max_length=100)
    description: Optional[str] = Field(None, max_length=500)
    category: MeetupCategory
    start_at: datetime
    duration_min: int = Field(60, ge=15, le=480)  # 15 min to 8 hours
    campus_id: Optional[str] = None  # Optional if inferred from user
    visibility: MeetupVisibility = MeetupVisibility.GLOBAL
    capacity: int = Field(10, ge=2, le=50)
    location: Optional[str] = Field(None, max_length=100)


class MeetupResponse(BaseModel):
    id: UUID
    creator_user_id: UUID
    campus_id: UUID
    title: str
    description: Optional[str]
    location: Optional[str]
    category: MeetupCategory
    start_at: datetime
    duration_min: int
    status: MeetupStatus
    room_id: Optional[UUID]
    cancel_reason: Optional[str]
    created_at: datetime
    updated_at: datetime
    participants_count: int = 0
    room_id: Optional[UUID]
    cancel_reason: Optional[str]
    created_at: datetime
    updated_at: datetime
    participants_count: int = 0
    is_joined: bool = False  # Computed for current user
    my_role: Optional[MeetupRole] = None
    current_user_id: Optional[UUID] = None # For frontend convenience
    visibility: MeetupVisibility = MeetupVisibility.GLOBAL
    capacity: int
    creator_name: Optional[str] = None
    creator_avatar_url: Optional[str] = None
    recent_participants_avatars: List[str] = []



class MeetupDetailResponse(MeetupResponse):
    participants: List[MeetupParticipant] = []
