"""Pydantic schemas for Clubs API."""

from __future__ import annotations

from datetime import datetime
from typing import Optional
from uuid import UUID

from pydantic import BaseModel, Field

class ClubCreateRequest(BaseModel):
    name: str = Field(..., min_length=3, max_length=100)
    description: Optional[str] = Field(default=None, max_length=500)
    campus_id: Optional[UUID] = None

class ClubMemberSchema(BaseModel):
    user_id: UUID
    role: str
    joined_at: datetime
    # We might want to include user display info here in a real app, 
    # but usually that's joined or fetched separately. 
    # For now, let's assume the frontend fetches user profiles or we include basic info.
    # To keep it simple and consistent with other domains, we might just return IDs 
    # and let the frontend hydrate, OR return a composite object.
    # Let's return just the basic member info for now.

class ClubResponse(BaseModel):
    id: UUID
    name: str
    description: Optional[str]
    owner_id: UUID
    campus_id: Optional[UUID]
    created_at: datetime
    member_count: int

class ClubDetailResponse(ClubResponse):
    pass
    # potentially list members or recent members here?
    # For now, let's keep members fetching separate or included if small.

class JoinClubRequest(BaseModel):
    pass # No body needed for simple join currently
