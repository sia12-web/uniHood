"""Pydantic schemas for proximity endpoints."""

from __future__ import annotations

from typing import Literal, Optional
from uuid import UUID

from pydantic import BaseModel, Field, field_validator

from app.domain.identity.schemas import GalleryImage, SocialLinks


class HeartbeatPayload(BaseModel):
	"""Payload emitted by the client when reporting the current location."""

	lat: float = Field(..., gt=-90.0, lt=90.0)
	lon: float = Field(..., gt=-180.0, lt=180.0)
	accuracy_m: int = Field(..., ge=1, le=200)
	campus_id: Optional[UUID] = None
	venue_id: Optional[UUID] = None
	device_id: str = Field(..., min_length=1)
	ts_client: int = Field(..., ge=0, description="Epoch milliseconds from the client device")

	@field_validator("accuracy_m")
	def validate_accuracy(cls, value: int) -> int:
		if value > 50:
			raise ValueError("accuracy must be ≤ 50 meters for Phase 1")
		return value


class NearbyQuery(BaseModel):
	"""Query parameters for the nearby lookup."""

	campus_id: Optional[UUID] = None
	# Allow flexible radii up to 50km to support directory mode (city-wide discovery).
	# Real-time proximity (Redis) is used for ≤50m, directory mode (DB) for larger radii.
	radius_m: int = Field(..., ge=1, le=50000)
	cursor: Optional[str] = None
	limit: int = Field(default=50, ge=1, le=200)
	filter: Literal["all", "friends"] = "all"
	include: Optional[list[Literal["profile", "distance"]]] = None
	scope: Literal["campus", "global"] = "campus"
	# Discovery mode: room (live 100m proximity), campus (same campus directory), city (all campuses directory)
	mode: Literal["room", "campus", "city"] = "campus"


class NearbyUser(BaseModel):
	"""Lite profile returned to the client when a user is nearby."""

	user_id: UUID
	display_name: str
	handle: str
	avatar_url: Optional[str] = None
	campus_name: Optional[str] = None
	major: Optional[str] = None
	graduation_year: Optional[int] = None
	distance_m: Optional[int] = Field(default=None, ge=0)
	is_friend: bool = False
	bio: Optional[str] = None
	passions: list[str] = Field(default_factory=list)
	gallery: list[GalleryImage] = Field(default_factory=list)
	courses: list[str] = Field(default_factory=list)
	social_links: SocialLinks = Field(default_factory=SocialLinks)
	banner_url: Optional[str] = None
	ten_year_vision: Optional[str] = None
	is_university_verified: bool = False
	
	# Expanded Profile Fields
	gender: Optional[str] = None
	birthday: Optional[str] = None
	hometown: Optional[str] = None
	languages: list[str] = Field(default_factory=list)
	relationship_status: Optional[str] = None
	sexual_orientation: Optional[str] = None
	looking_for: list[str] = Field(default_factory=list)
	height: Optional[int] = None
	lifestyle: dict = Field(default_factory=dict)
	profile_prompts: list[dict] = Field(default_factory=list)


class NearbyResponse(BaseModel):
	items: list[NearbyUser]
	cursor: Optional[str] = None


class PresenceStatusResponse(BaseModel):
	online: bool
	ts: Optional[int] = None


class PresenceLookupItem(BaseModel):
	user_id: str
	online: bool
	last_seen: Optional[str] = None


class PresenceLookupResponse(BaseModel):
	items: list[PresenceLookupItem]

