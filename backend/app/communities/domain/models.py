"""Domain models for communities core entities."""

from __future__ import annotations

from datetime import datetime
from typing import Any, Optional
from uuid import UUID

from pydantic import BaseModel, ConfigDict


class Group(BaseModel):
	"""Represents a community group."""

	id: UUID
	campus_id: Optional[UUID] = None
	name: str
	slug: str
	description: str
	visibility: str
	avatar_key: Optional[str] = None
	cover_key: Optional[str] = None
	is_locked: bool
	tags: list[str]
	created_by: UUID
	created_at: datetime
	updated_at: datetime
	deleted_at: Optional[datetime] = None

	model_config = ConfigDict(from_attributes=True)


class GroupMember(BaseModel):
	"""Represents a membership row."""

	id: UUID
	group_id: UUID
	user_id: UUID
	role: str
	joined_at: datetime
	muted_until: Optional[datetime] = None
	is_banned: bool
	created_at: datetime
	updated_at: datetime

	model_config = ConfigDict(from_attributes=True)


class Post(BaseModel):
	"""Represents a group post."""

	id: UUID
	group_id: UUID
	author_id: UUID
	title: Optional[str] = None
	body: str
	topic_tags: list[str]
	media_count: int
	reactions_count: int
	comments_count: int
	is_pinned: bool
	created_at: datetime
	updated_at: datetime
	deleted_at: Optional[datetime] = None

	model_config = ConfigDict(from_attributes=True)


class Comment(BaseModel):
	"""Represents a comment on a post."""

	id: UUID
	post_id: UUID
	author_id: UUID
	parent_id: Optional[UUID] = None
	body: str
	depth: int
	reactions_count: int
	created_at: datetime
	updated_at: datetime
	deleted_at: Optional[datetime] = None

	model_config = ConfigDict(from_attributes=True)


class Reaction(BaseModel):
	"""Represents a reaction on a post or comment."""

	id: UUID
	subject_type: str
	subject_id: UUID
	user_id: UUID
	emoji: str
	created_at: datetime
	effective_weight: float = 1.0

	model_config = ConfigDict(from_attributes=True)


class EventVenue(BaseModel):
	"""Represents a physical or virtual venue."""

	id: UUID
	campus_id: Optional[UUID] = None
	name: str
	kind: str
	address: Optional[str] = None
	lat: Optional[float] = None
	lon: Optional[float] = None
	url: Optional[str] = None
	tz: str
	created_at: datetime
	updated_at: datetime

	model_config = ConfigDict(from_attributes=True)


class Event(BaseModel):
	"""Represents a community event."""

	id: UUID
	group_id: UUID
	campus_id: Optional[UUID] = None
	title: str
	description: str
	venue_id: Optional[UUID] = None
	start_at: datetime
	end_at: datetime
	all_day: bool
	capacity: Optional[int] = None
	visibility: str
	rrule: Optional[str] = None
	allow_guests: bool
	created_by: UUID
	created_at: datetime
	updated_at: datetime
	deleted_at: Optional[datetime] = None

	model_config = ConfigDict(from_attributes=True)


class EventRSVP(BaseModel):
	"""Represents an attendee response."""

	id: UUID
	event_id: UUID
	user_id: UUID
	status: str
	guests: int
	created_at: datetime
	updated_at: datetime

	model_config = ConfigDict(from_attributes=True)


class EventCounter(BaseModel):
	"""Tracks aggregate RSVP counts per event."""

	event_id: UUID
	going: int
	waitlisted: int
	interested: int
	updated_at: datetime

	model_config = ConfigDict(from_attributes=True)


class MediaAttachment(BaseModel):
	"""Represents an attachment stored in S3."""

	id: UUID
	subject_type: str
	subject_id: UUID
	s3_key: str
	mime: str
	size_bytes: int
	width: Optional[int] = None
	height: Optional[int] = None
	created_by: UUID
	created_at: datetime

	model_config = ConfigDict(from_attributes=True)


class FeedEntry(BaseModel):
	"""Represents a row in the persistent user feed."""

	id: int
	owner_id: UUID
	post_id: UUID
	group_id: UUID
	rank_score: float
	created_at: datetime
	inserted_at: datetime
	deleted_at: Optional[datetime] = None

	model_config = ConfigDict(from_attributes=True)


class FeedOffsetState(BaseModel):
	"""Stores the last processed cursor for feed rebuilds."""

	owner_id: UUID
	last_posted_at: Optional[datetime] = None
	last_id: Optional[int] = None

	model_config = ConfigDict(from_attributes=True)


class NotificationChannel(BaseModel):
	"""Represents a notification delivery channel."""

	id: UUID
	user_id: UUID
	kind: str
	endpoint: Optional[str] = None
	preferences: dict[str, Any]
	created_at: datetime

	model_config = ConfigDict(from_attributes=True)


class NotificationEntity(BaseModel):
	"""Stored notification destined for a user."""

	id: int
	user_id: UUID
	type: str
	ref_id: UUID
	actor_id: UUID
	payload: dict[str, Any]
	is_read: bool
	is_delivered: bool
	created_at: datetime

	model_config = ConfigDict(from_attributes=True)


class UnreadCounter(BaseModel):
	"""Materialised unread notification count."""

	user_id: UUID
	count: int
	updated_at: datetime

	model_config = ConfigDict(from_attributes=True)


class GroupInvite(BaseModel):
	"""Invitation for a user to join a group with a role."""

	id: UUID
	group_id: UUID
	invited_user_id: UUID
	invited_by: UUID
	role: str
	expires_at: Optional[datetime] = None
	accepted_at: Optional[datetime] = None
	created_at: datetime

	model_config = ConfigDict(from_attributes=True)


class GroupJoinRequest(BaseModel):
	"""User-submitted request to join a group."""

	id: UUID
	group_id: UUID
	user_id: UUID
	status: str
	reviewed_by: Optional[UUID] = None
	reviewed_at: Optional[datetime] = None
	created_at: datetime

	model_config = ConfigDict(from_attributes=True)


class GroupAuditEvent(BaseModel):
	"""Audit log entry for sensitive community actions."""

	id: UUID
	group_id: UUID
	user_id: UUID
	action: str
	details: Optional[dict[str, Any]] = None
	created_at: datetime

	model_config = ConfigDict(from_attributes=True)


class OutboxEvent(BaseModel):
	"""Represents a queued event awaiting fan-out."""

	id: int
	aggregate_type: str
	aggregate_id: UUID
	event_type: str
	payload: dict
	created_at: datetime
	processed_at: Optional[datetime] = None

	model_config = ConfigDict(from_attributes=True)
