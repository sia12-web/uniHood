"""Pydantic schemas for invites and friendships."""

from __future__ import annotations

from datetime import datetime
from typing import Literal, Optional
from uuid import UUID

from pydantic import BaseModel, Field


class InviteSendRequest(BaseModel):
	to_user_id: UUID = Field(..., description="Target user for the invite")
	campus_id: Optional[UUID] = Field(default=None, description="Optional campus scoping")
	message: Optional[str] = Field(default=None, description="Optional message (discarded in Phase 2)")


class InviteSummary(BaseModel):
	id: UUID
	from_user_id: UUID
	to_user_id: UUID
	status: Literal["sent", "accepted", "declined", "cancelled", "expired"]
	created_at: datetime
	updated_at: datetime
	expires_at: datetime
	from_handle: Optional[str] = None
	from_display_name: Optional[str] = None
	to_handle: Optional[str] = None
	to_display_name: Optional[str] = None


class InviteUpdatePayload(BaseModel):
	id: UUID
	status: Literal["accepted", "declined", "cancelled", "expired"]


class FriendRow(BaseModel):
	user_id: UUID
	friend_id: UUID
	status: Literal["pending", "accepted", "blocked"]
	created_at: datetime
	friend_handle: Optional[str] = None
	friend_display_name: Optional[str] = None
	xp: Optional[int] = None
	level: Optional[int] = None


class MutualFriend(BaseModel):
	user_id: UUID
	display_name: str
	handle: str
	avatar_url: Optional[str] = None
	xp: Optional[int] = None
	level: Optional[int] = None


class FriendUpdatePayload(BaseModel):
	user_id: UUID
	friend_id: UUID
	status: Literal["accepted", "blocked", "none"]
