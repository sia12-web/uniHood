"""Pydantic schemas for Phase 4 rooms API."""

from __future__ import annotations

from datetime import datetime
from typing import List, Optional

from pydantic import BaseModel, Field

PRESET_VALUES = ("2-4", "4-6", "12+")
VISIBILITY_VALUES = ("private", "link")
ROLE_VALUES = ("owner", "moderator", "member")
MESSAGE_KIND_VALUES = ("text", "image", "file")


class RoomCreateRequest(BaseModel):
    name: str = Field(..., max_length=80)
    preset: str = Field(..., pattern="^(2-4|4-6|12\+)$")
    visibility: str = Field(..., pattern="^(private|link)$")
    campus_id: Optional[str] = Field(default=None, description="Explicit campus override")


class RoomSummary(BaseModel):
    id: str
    campus_id: str
    name: str
    preset: str
    capacity: int
    visibility: str
    join_code: Optional[str] = None
    owner_id: str
    members_count: int
    role: str


class RoomDetail(RoomSummary):
    members: List["RoomMemberSummary"] = Field(default_factory=list)


class RoomMemberSummary(BaseModel):
    user_id: str
    role: str
    muted: bool
    joined_at: datetime


class RoomMembersResponse(BaseModel):
    items: List[RoomMemberSummary]


class JoinByCodeRequest(BaseModel):
    join_code: str = Field(..., min_length=6, max_length=32)


class RoleUpdateRequest(BaseModel):
    role: str = Field(..., pattern="^(owner|moderator|member)$")


class MuteRequest(BaseModel):
    on: bool


class RoomMessageSendRequest(BaseModel):
    client_msg_id: str = Field(..., min_length=8, max_length=64)
    kind: str = Field(..., pattern="^(text|image|file)$")
    content: Optional[str] = Field(default=None, max_length=4000)
    media_key: Optional[str] = None
    media_mime: Optional[str] = None
    media_bytes: Optional[int] = Field(default=None, ge=1)


class RoomMessageDTO(BaseModel):
    id: str
    room_id: str
    seq: int
    sender_id: str
    kind: str
    content: Optional[str] = None
    media_key: Optional[str] = None
    media_mime: Optional[str] = None
    media_bytes: Optional[int] = None
    created_at: datetime


class RoomHistoryResponse(BaseModel):
    items: List[RoomMessageDTO]
    cursor: Optional[str] = None
    direction: str


class ReadRequest(BaseModel):
    up_to_seq: int = Field(..., ge=0)


class PresignRequest(BaseModel):
    kind: str = Field(..., pattern="^(image|file)$")
    mime: str
    bytes: int = Field(..., ge=1)


class PresignResponse(BaseModel):
    key: str
    url: str
    expires_s: int


class RotateInviteResponse(BaseModel):
    join_code: Optional[str]


class TypingEvent(BaseModel):
    room_id: str
    user_id: str
    on: bool


class DMRoomCreateRequest(BaseModel):
    peer_id: str
    campus_id: Optional[str] = None


class DMRoomResponse(BaseModel):
    room_id: str
    conversation_id: str
    participants: List[str]


RoomDetail.model_rebuild()

