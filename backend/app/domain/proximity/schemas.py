"""Pydantic schemas for proximity endpoints."""

from __future__ import annotations

from typing import Literal, Optional
from uuid import UUID

from pydantic import BaseModel, Field, field_validator

from app.domain.identity.schemas import GalleryImage


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
	# Allow flexible radii up to 2km to support realistic campus use cases.
	radius_m: int = Field(..., ge=1, le=2000)
	cursor: Optional[str] = None
	limit: int = Field(default=50, ge=1, le=200)
	filter: Literal["all", "friends"] = "all"
	include: Optional[list[Literal["profile", "distance"]]] = None


class NearbyUser(BaseModel):
	"""Lite profile returned to the client when a user is nearby."""

	user_id: UUID
	display_name: str
	handle: str
	avatar_url: Optional[str] = None
	major: Optional[str] = None
	graduation_year: Optional[int] = None
	distance_m: Optional[int] = Field(default=None, ge=0)
	is_friend: bool = False
	bio: Optional[str] = None
	passions: list[str] = Field(default_factory=list)
	gallery: list[GalleryImage] = Field(default_factory=list)
	courses: list[str] = Field(default_factory=list)


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

