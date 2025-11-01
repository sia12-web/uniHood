"""Domain models for Phase 4 rooms & group chat."""

from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime
from typing import Iterable, Optional


RoomVisibility = str
RoomPreset = str
RoomRole = str
MessageKind = str


@dataclass(slots=True)
class Room:
    """Persisted representation of a chat room."""

    id: str
    campus_id: str
    owner_id: str
    name: str
    preset: RoomPreset
    visibility: RoomVisibility
    capacity: int
    join_code: Optional[str]
    created_at: datetime
    updated_at: datetime
    members_count: int = 0

    def is_private(self) -> bool:
        return self.visibility == "private"

    def to_summary(
        self,
        role: RoomRole,
        join_code: Optional[str] = None,
        *,
        include_join_code: bool = False,
    ) -> dict:
        """Return a dictionary payload suitable for RoomSummary schema."""
        code: Optional[str] = None
        if include_join_code and self.visibility == "link":
            code = join_code or self.join_code
        return {
            "id": self.id,
            "campus_id": self.campus_id,
            "name": self.name,
            "preset": self.preset,
            "capacity": self.capacity,
            "visibility": self.visibility,
            "join_code": code,
            "owner_id": self.owner_id,
            "members_count": self.members_count,
            "role": role,
        }


@dataclass(slots=True)
class RoomMember:
    room_id: str
    user_id: str
    role: RoomRole
    muted: bool
    joined_at: datetime

    def can_moderate(self) -> bool:
        return self.role in {"owner", "moderator"}

    def is_owner(self) -> bool:
        return self.role == "owner"


@dataclass(slots=True)
class RoomMessage:
    id: str
    room_id: str
    seq: int
    sender_id: str
    client_msg_id: str
    kind: MessageKind
    content: Optional[str]
    media_key: Optional[str]
    media_mime: Optional[str]
    media_bytes: Optional[int]
    created_at: datetime

    def to_dict(self) -> dict:
        return {
            "id": self.id,
            "room_id": self.room_id,
            "seq": self.seq,
            "sender_id": self.sender_id,
            "client_msg_id": self.client_msg_id,
            "kind": self.kind,
            "content": self.content,
            "media_key": self.media_key,
            "media_mime": self.media_mime,
            "media_bytes": self.media_bytes,
            "created_at": self.created_at.isoformat(),
        }


@dataclass(slots=True)
class RoomReceipt:
    room_id: str
    user_id: str
    delivered_seq: int
    read_seq: int
    updated_at: datetime


@dataclass(slots=True)
class HistoryPage:
    items: Iterable[RoomMessage]
    cursor: Optional[str]
    direction: str
    limit: int

