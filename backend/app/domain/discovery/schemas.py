"""Schemas for discovery swipe feed and interactions."""

from __future__ import annotations

from typing import Optional
from uuid import UUID

from pydantic import BaseModel, Field, HttpUrl

from app.domain.identity.schemas import GalleryImage


class DiscoveryPrompt(BaseModel):
	id: UUID
	category: str
	question: str
	field_key: str
	type: str = "text"
	options: Optional[list[str]] = None


class DiscoveryProfile(BaseModel):
	user_id: UUID
	core_identity: dict = Field(default_factory=dict)
	personality: dict = Field(default_factory=dict)
	campus_life: dict = Field(default_factory=dict)
	dating_adjacent: dict = Field(default_factory=dict)
	taste: dict = Field(default_factory=dict)
	playful: dict = Field(default_factory=dict)
	auto_tags: list[str] = Field(default_factory=list)
	compatibility_signals: list[str] = Field(default_factory=list)


class DiscoveryProfileUpdate(BaseModel):
	core_identity: Optional[dict] = None
	personality: Optional[dict] = None
	campus_life: Optional[dict] = None
	dating_adjacent: Optional[dict] = None
	taste: Optional[dict] = None
	playful: Optional[dict] = None


class DiscoveryCard(BaseModel):
	user_id: UUID
	display_name: str = ""
	handle: Optional[str] = None
	avatar_url: Optional[str] = None
	campus_id: Optional[UUID] = None
	major: Optional[str] = None
	graduation_year: Optional[int] = Field(default=None, ge=1900, le=2100)
	interests: list[str] = Field(default_factory=list)
	passions: list[str] = Field(default_factory=list)
	courses: list[str] = Field(default_factory=list)
	distance_m: Optional[float] = None
	gallery: list[GalleryImage] = Field(default_factory=list)
	is_friend: bool = False
	is_friend_of_friend: bool = False
	# New fields for social discovery
	vibe_tags: list[str] = Field(default_factory=list)
	top_prompts: list[dict] = Field(default_factory=list) # [{question: ..., answer: ...}]
	compatibility_hint: Optional[str] = None
	is_university_verified: bool = False
	
	# Expanded Profile Fields
	gender: Optional[str] = None
	age: Optional[int] = None
	hometown: Optional[str] = None
	languages: list[str] = Field(default_factory=list)
	relationship_status: Optional[str] = None
	looking_for: list[str] = Field(default_factory=list)
	lifestyle: dict = Field(default_factory=dict)
	sexual_orientation: Optional[str] = None
	height: Optional[int] = None


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
