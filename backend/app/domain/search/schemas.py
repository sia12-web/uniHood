"""Pydantic schemas for Search & Discovery APIs."""

from __future__ import annotations

from typing import Any, Generic, Optional, TypeVar
from uuid import UUID

from pydantic import BaseModel, Field, __version__ as pydantic_version

PYDANTIC_MAJOR = int(pydantic_version.split(".")[0])


class SearchUsersQuery(BaseModel):
	q: str = Field(..., min_length=1, description="Raw user input")
	campus_id: Optional[UUID] = Field(default=None, description="Campus scope override")
	limit: int = Field(default=20, ge=1, le=50)
	cursor: Optional[str] = Field(default=None, description="Opaque cursor for pagination")

	def normalized_query(self) -> str:
		return self.q.strip().lower()


class DiscoverPeopleQuery(BaseModel):
	campus_id: Optional[UUID] = Field(default=None)
	limit: int = Field(default=20, ge=1, le=50)
	cursor: Optional[str] = Field(default=None)


class DiscoverRoomsQuery(BaseModel):
	campus_id: Optional[UUID] = Field(default=None)
	limit: int = Field(default=20, ge=1, le=50)
	cursor: Optional[str] = Field(default=None)


class MultiSearchQuery(BaseModel):
	q: str = Field(..., min_length=1, max_length=120)
	type: Optional[str] = Field(default=None, description="Comma-separated entity types")
	campus_id: Optional[UUID] = Field(default=None)
	cursor: Optional[str] = Field(default=None)
	limit: int = Field(default=20, ge=10, le=50)


class UserResult(BaseModel):
	user_id: UUID
	handle: str
	display_name: str
	avatar_url: Optional[str] = None
	is_friend: bool
	mutual_count: int = 0
	score: float = Field(..., ge=0.0)


class RoomResult(BaseModel):
	room_id: UUID
	name: str
	preset: str = Field(..., pattern=r"^(2-4|4-6|12\+)$")
	members_count: int = Field(..., ge=0)
	msg_24h: int = Field(..., ge=0)
	score: float = Field(..., ge=0.0)


class SearchBucket(BaseModel):
	items: list[Any]
	next: Optional[str] = None


class MultiSearchResponse(BaseModel):
	q: str
	buckets: dict[str, SearchBucket]


T = TypeVar("T")


if PYDANTIC_MAJOR >= 2:
	class ListResponse(BaseModel, Generic[T]):
		items: list[T]
		cursor: Optional[str] = None

else:  # pragma: no cover - fallback for Pydantic v1
	from pydantic.generics import GenericModel

	class ListResponse(GenericModel, Generic[T]):
		items: list[T]
		cursor: Optional[str] = None
