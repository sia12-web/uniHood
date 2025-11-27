"""Schemas for discovery swipe feed and interactions."""

from __future__ import annotations

from typing import Optional
from uuid import UUID

from pydantic import BaseModel, Field, HttpUrl

from app.domain.identity.schemas import GalleryImage


class DiscoveryCard(BaseModel):
	user_id: UUID
	display_name: str = ""
	handle: Optional[str] = None
	avatar_url: Optional[HttpUrl] = None
	campus_id: Optional[UUID] = None
	major: Optional[str] = None
	graduation_year: Optional[int] = Field(default=None, ge=1900, le=2100)
	interests: list[str] = Field(default_factory=list)
	passions: list[str] = Field(default_factory=list)
	courses: list[str] = Field(default_factory=list)
	distance_m: Optional[float] = None
	gallery: list[GalleryImage] = Field(default_factory=list)
	is_friend: bool = False


class DiscoveryFeedResponse(BaseModel):
	items: list[DiscoveryCard] = Field(default_factory=list)
	cursor: Optional[str] = None
	exhausted: bool = False


class InteractionPayload(BaseModel):
	target_id: UUID
	cursor: Optional[str] = None


class InteractionResponse(BaseModel):
	next_cursor: Optional[str] = None
	exhausted: bool = False
