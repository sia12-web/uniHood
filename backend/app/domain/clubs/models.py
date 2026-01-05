"""Domain models for Clubs."""

from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime
from typing import Optional
from uuid import UUID

@dataclass
class Club:
    id: UUID
    name: str
    description: Optional[str]
    owner_id: UUID
    campus_id: Optional[UUID]
    created_at: datetime
    updated_at: datetime
    
    # Non-DB fields populated by service/queries
    member_count: int = 0

@dataclass
class ClubMember:
    club_id: UUID
    user_id: UUID
    role: str  # 'owner', 'member'
    joined_at: datetime
    
    @property
    def is_owner(self) -> bool:
        return self.role == 'owner'
