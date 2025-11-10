"""Pydantic schemas for communities API."""

from __future__ import annotations

from datetime import datetime
from typing import Any, Dict, List, Optional
from uuid import UUID

from pydantic import BaseModel, Field


class GroupBase(BaseModel):
	name: str = Field(..., min_length=3, max_length=80)
	slug: str = Field(..., min_length=3, max_length=80)
	description: str = Field(default="", max_length=4000)
	visibility: str = Field(..., pattern="^(public|private|secret)$")
	tags: List[str] = Field(default_factory=list, max_length=20)
	campus_id: Optional[UUID] = None
	avatar_key: Optional[str] = None
	cover_key: Optional[str] = None
	is_locked: bool = False


class GroupCreateRequest(GroupBase):
	pass


class GroupUpdateRequest(BaseModel):
	name: Optional[str] = Field(default=None, min_length=3, max_length=80)
	description: Optional[str] = Field(default=None, max_length=4000)
	visibility: Optional[str] = Field(default=None, pattern="^(public|private|secret)$")
	tags: Optional[List[str]] = None
	avatar_key: Optional[str] = None
	cover_key: Optional[str] = None
	is_locked: Optional[bool] = None


class GroupResponse(GroupBase):
	id: UUID
	created_by: UUID
	created_at: datetime
	updated_at: datetime
	deleted_at: Optional[datetime] = None
	role: Optional[str] = None


class GroupListResponse(BaseModel):
	items: List[GroupResponse]


class MemberResponse(BaseModel):
	id: UUID
	group_id: UUID
	user_id: UUID
	role: str
	joined_at: datetime
	muted_until: Optional[datetime] = None
	is_banned: bool


class MemberUpdateRequest(BaseModel):
	role: Optional[str] = Field(default=None, pattern="^(owner|admin|moderator|member)$")
	is_banned: Optional[bool] = None
	muted_until: Optional[datetime] = None


class PostCreateRequest(BaseModel):
	title: Optional[str] = Field(default=None, max_length=140)
	body: str = Field(..., min_length=1, max_length=40000)
	topic_tags: List[str] = Field(default_factory=list)


class PostUpdateRequest(BaseModel):
	title: Optional[str] = Field(default=None, max_length=140)
	body: Optional[str] = Field(default=None, min_length=1, max_length=40000)
	topic_tags: Optional[List[str]] = None
	is_pinned: Optional[bool] = None


class PostResponse(BaseModel):
	id: UUID
	group_id: UUID
	author_id: UUID
	title: Optional[str] = None
	body: str
	topic_tags: List[str]
	media_count: int
	reactions_count: int
	comments_count: int
	is_pinned: bool
	created_at: datetime
	updated_at: datetime
	deleted_at: Optional[datetime] = None
	moderation: Optional[Dict[str, bool]] = None


class PostListResponse(BaseModel):
	items: List[PostResponse]
	next_cursor: Optional[str] = None


class CommentCreateRequest(BaseModel):
	body: str = Field(..., min_length=1, max_length=10000)
	parent_id: Optional[UUID] = None


class CommentUpdateRequest(BaseModel):
	body: str = Field(..., min_length=1, max_length=10000)


class CommentResponse(BaseModel):
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
	moderation: Optional[Dict[str, bool]] = None


class CommentListResponse(BaseModel):
	items: List[CommentResponse]
	next_cursor: Optional[str] = None


class ReactionRequest(BaseModel):
	subject_type: str = Field(..., pattern="^(post|comment)$")
	subject_id: UUID
	emoji: str = Field(..., min_length=1, max_length=16)


class UploadPresignRequest(BaseModel):
	mime: str
	size_bytes: int = Field(..., ge=1, le=104_857_600)
	purpose: str = Field(..., pattern="^(group|post|comment)$")
	width: Optional[int] = Field(default=None, ge=1)
	height: Optional[int] = Field(default=None, ge=1)


class UploadPresignResponse(BaseModel):
	key: str
	url: str
	fields: dict[str, str]
	expires_in: int


class AttachmentCreateRequest(BaseModel):
	subject_type: str = Field(..., pattern="^(group|post|comment)$")
	subject_id: UUID
	s3_key: str
	mime: str
	size_bytes: int = Field(..., ge=1, le=104_857_600)
	width: Optional[int] = Field(default=None, ge=1)
	height: Optional[int] = Field(default=None, ge=1)


class AttachmentResponse(BaseModel):
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


class FeedEntryResponse(BaseModel):
	post_id: UUID
	group_id: UUID
	rank_score: float
	inserted_at: datetime


class FeedListResponse(BaseModel):
	items: List[FeedEntryResponse]
	next_cursor: Optional[str] = None


class RankedFeedItem(BaseModel):
	post_id: UUID
	author_id: UUID
	group_id: UUID
	score: float
	created_at: datetime


class RankedFeedResponse(BaseModel):
	items: List[RankedFeedItem]
	next: Optional[str] = None


class FeedRebuildRequest(BaseModel):
	owner_id: UUID


class FeedRebuildResponse(BaseModel):
	enqueued: bool = True


class TagLookupResponse(BaseModel):
	items: List[str]


class EventBase(BaseModel):
	title: str = Field(..., min_length=3, max_length=120)
	description: str = Field(default="", max_length=8000)
	venue_id: Optional[UUID] = None
	start_at: datetime
	end_at: datetime
	all_day: bool = False
	capacity: Optional[int] = Field(default=None, ge=1)
	visibility: str = Field(..., pattern="^(public|private|secret)$")
	rrule: Optional[str] = Field(default=None, max_length=256)
	allow_guests: bool = False
	campus_id: Optional[UUID] = None


class EventCreateRequest(EventBase):
	pass


class EventUpdateRequest(BaseModel):
	title: Optional[str] = Field(default=None, min_length=3, max_length=120)
	description: Optional[str] = Field(default=None, max_length=8000)
	venue_id: Optional[UUID] = None
	start_at: Optional[datetime] = None
	end_at: Optional[datetime] = None
	all_day: Optional[bool] = None
	capacity: Optional[int] = Field(default=None, ge=1)
	visibility: Optional[str] = Field(default=None, pattern="^(public|private|secret)$")
	rrule: Optional[str] = Field(default=None, max_length=256)
	allow_guests: Optional[bool] = None
	campus_id: Optional[UUID] = None


class EventCounters(BaseModel):
	going: int = 0
	waitlisted: int = 0
	interested: int = 0


class EventResponse(EventBase):
	id: UUID
	group_id: UUID
	created_by: UUID
	created_at: datetime
	updated_at: datetime
	deleted_at: Optional[datetime] = None
	counters: EventCounters
	role: Optional[str] = None


class EventListResponse(BaseModel):
	items: List[EventResponse]
	next_cursor: Optional[str] = None


class RSVPUpsertRequest(BaseModel):
	status: str = Field(..., pattern="^(going|declined|interested)$")
	guests: Optional[int] = Field(default=0, ge=0, le=5)


class RSVPAdminUpdateRequest(BaseModel):
	status: str = Field(..., pattern="^(going|waitlisted|declined|interested)$")
	guests: Optional[int] = Field(default=None, ge=0, le=5)


class RSVPResponse(BaseModel):
	id: UUID
	event_id: UUID
	user_id: UUID
	status: str
	guests: int
	created_at: datetime
	updated_at: datetime


class RSVPListResponse(BaseModel):
	items: List[RSVPResponse]


class EventReminderPreviewResponse(BaseModel):
	event_id: UUID
	schedule: List[datetime]


class GroupSearchResult(BaseModel):
	id: str
	name: str
	slug: str
	description: Optional[str] = None
	tags: List[str] = Field(default_factory=list)
	score: Optional[float] = None
	source: str = "opensearch"


class GroupSearchResponse(BaseModel):
	items: List[GroupSearchResult]
	backend: str
	took_ms: int


class GroupTypeaheadResponse(BaseModel):
	items: List[GroupSearchResult]
	backend: str
	took_ms: int


class NotificationResponse(BaseModel):
	id: int
	user_id: UUID
	type: str
	ref_id: UUID
	actor_id: UUID
	payload: dict[str, Any]
	is_read: bool
	is_delivered: bool
	created_at: datetime


class NotificationListResponse(BaseModel):
	items: List[NotificationResponse]
	next_cursor: Optional[str] = None


class NotificationMarkReadRequest(BaseModel):
	ids: List[int] = Field(default_factory=list)
	mark_read: bool = True


class NotificationMarkReadResponse(BaseModel):
	updated: int


class NotificationUnreadResponse(BaseModel):
	count: int


class PresenceHeartbeatRequest(BaseModel):
	group_ids: List[UUID] = Field(default_factory=list)


class PresenceMemberStatus(BaseModel):
	user_id: UUID
	online: bool
	last_seen: Optional[datetime] = None


class PresenceListResponse(BaseModel):
	group_id: Optional[UUID] = None
	items: List[PresenceMemberStatus]


class RoleAssignmentRequest(BaseModel):
	user_id: UUID
	role: str = Field(..., pattern="^(owner|admin|moderator|member)$")


class InviteCreateRequest(BaseModel):
	user_id: UUID
	role: str = Field(..., pattern="^(owner|admin|moderator|member)$")
	expires_at: Optional[datetime] = None


class InviteResponse(BaseModel):
	id: UUID
	group_id: UUID
	invited_user_id: UUID
	invited_by: UUID
	role: str
	expires_at: Optional[datetime] = None
	accepted_at: Optional[datetime] = None
	created_at: datetime


class JoinRequestCreateRequest(BaseModel):
	message: Optional[str] = Field(default=None, max_length=500)


class JoinRequestReviewRequest(BaseModel):
	status: str = Field(..., pattern="^(approved|rejected)$")
	comment: Optional[str] = Field(default=None, max_length=500)


class JoinRequestResponse(BaseModel):
	id: UUID
	group_id: UUID
	user_id: UUID
	status: str
	reviewed_by: Optional[UUID] = None
	reviewed_at: Optional[datetime] = None
	created_at: datetime


class BanMuteRequest(BaseModel):
	user_id: UUID
	is_banned: Optional[bool] = None
	muted_until: Optional[datetime] = None


class AuditEventResponse(BaseModel):
	id: UUID
	group_id: UUID
	user_id: UUID
	action: str
	details: Optional[dict[str, Any]] = None
	created_at: datetime


class EscalateRequest(BaseModel):
	reason: str = Field(..., min_length=5, max_length=400)
	target_user_id: Optional[UUID] = None
