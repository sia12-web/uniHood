"""Service layer orchestrating communities domain operations."""

from __future__ import annotations

import re
from datetime import datetime, timezone
from typing import Any, Callable, Iterable, Optional
from uuid import UUID

import asyncpg

from app.communities.domain import events, models, policies, repo as repo_module
from app.communities.domain.exceptions import ForbiddenError, NotFoundError, ValidationError
from app.communities.schemas import dto
from app.communities.infra import idempotency, redis_streams, s3, redis as feed_cache
from app.communities.services import feed_query as feed_query_service
from app.infra.auth import AuthenticatedUser
from app.infra.postgres import get_pool
from app.obs import metrics as obs_metrics
from app.moderation.domain.container import get_write_gate
from app.moderation.middleware.write_gate_v2 import WriteContext


_EXTERNAL_LINK_RE = re.compile(r"https?://\S+", re.IGNORECASE)


def _strip_external_links(text: str) -> str:
	return _EXTERNAL_LINK_RE.sub("[link removed]", text)


def _build_moderation_meta(ctx: WriteContext) -> dict[str, bool] | None:
	flags: dict[str, bool] = {}
	if ctx.shadow:
		flags["shadowed"] = True
	if ctx.strip_links:
		flags["links_stripped"] = True
	if ctx.metadata.get("link_cooloff"):
		flags["link_cooloff"] = True
	return flags or None


class CommunitiesService:
	"""Implements core business logic for groups, posts, and related entities."""

	def __init__(
		self,
		repository: repo_module.CommunitiesRepository | None = None,
		feed_query: feed_query_service.FeedQueryService | None = None,
	) -> None:
		self.repo = repository or repo_module.CommunitiesRepository()
		self.feed_query = feed_query or feed_query_service.FeedQueryService(self.repo)

	# ------------------------------------------------------------------
	# Helpers

	async def _with_conn(self, func: Callable[[asyncpg.Connection], Any]) -> Any:
		pool = await get_pool()
		async with pool.acquire() as conn:
			return await func(conn)

	@staticmethod
	def _group_to_response(group: models.Group, *, role: str | None) -> dto.GroupResponse:
		return dto.GroupResponse(
			id=group.id,
			name=group.name,
			slug=group.slug,
			description=group.description,
			visibility=group.visibility,
			tags=group.tags,
			campus_id=group.campus_id,
			avatar_key=group.avatar_key,
			cover_key=group.cover_key,
			is_locked=group.is_locked,
			created_by=group.created_by,
			created_at=group.created_at,
			updated_at=group.updated_at,
			deleted_at=group.deleted_at,
			role=role,
		)

	@staticmethod
	def _post_to_response(post: models.Post, *, moderation: dict[str, bool] | None = None) -> dto.PostResponse:
		payload = post.model_dump()
		if moderation:
			payload["moderation"] = moderation
		return dto.PostResponse(**payload)

	@staticmethod
	def _comment_to_response(comment: models.Comment, *, moderation: dict[str, bool] | None = None) -> dto.CommentResponse:
		payload = comment.model_dump()
		if moderation:
			payload["moderation"] = moderation
		return dto.CommentResponse(**payload)

	@staticmethod
	def _member_to_response(member: models.GroupMember) -> dto.MemberResponse:
		return dto.MemberResponse(**member.model_dump())

	async def _ensure_group_visible(
		self,
		group_id: UUID,
		user: AuthenticatedUser,
	) -> tuple[models.Group, models.GroupMember | None]:
		group = await self.repo.get_group(group_id)
		membership = await self.repo.get_member(group_id, UUID(user.id))
		is_member = membership is not None
		group = policies.require_visible(group, is_member=is_member)
		return group, membership

	# ------------------------------------------------------------------
	# Group operations

	async def create_group(
		self,
		user: AuthenticatedUser,
		payload: dto.GroupCreateRequest,
		*,
		idempotency_key: str | None = None,
	) -> dto.GroupResponse:
		policies.ensure_visibility_valid(payload.visibility)
		policies.ensure_topic_tag_length(payload.tags)
		key = policies.ensure_idempotency_key(idempotency_key)
		body_hash = idempotency.compute_hash(body=payload.model_dump())

		async def _producer() -> dto.GroupResponse:
			await self.repo.ensure_tags(payload.tags)
			group = await self.repo.create_group(
				name=payload.name,
				slug=payload.slug,
				description=payload.description,
				visibility=payload.visibility,
				created_by=UUID(user.id),
				tags=payload.tags,
				campus_id=payload.campus_id,
				avatar_key=payload.avatar_key,
				cover_key=payload.cover_key,
			)
			await self._enqueue_outbox("group", group.id, "created", events.group_payload(group))
			obs_metrics.inc_community_groups_created()
			return self._group_to_response(group, role="owner")

		return await idempotency.resolve(
			key=key,
			body_hash=body_hash,
			producer=_producer,
			serializer=lambda response: response.model_dump(mode="json"),
			deserializer=lambda raw: dto.GroupResponse.model_validate(raw),
		)

	async def get_group(self, user: AuthenticatedUser, group_id: UUID) -> dto.GroupResponse:
		group, membership = await self._ensure_group_visible(group_id, user)
		return self._group_to_response(group, role=membership.role if membership else None)

	async def update_group(
		self,
		user: AuthenticatedUser,
		group_id: UUID,
		payload: dto.GroupUpdateRequest,
	) -> dto.GroupResponse:
		group, membership = await self._ensure_group_visible(group_id, user)
		policies.assert_can_admin(membership.role if membership else None)
		if payload.tags is not None:
			policies.ensure_topic_tag_length(payload.tags)
		await self.repo.ensure_tags(payload.tags or [])
		updated = await self.repo.update_group(
			group_id,
			name=payload.name,
			description=payload.description,
			visibility=payload.visibility,
			avatar_key=payload.avatar_key,
			cover_key=payload.cover_key,
			tags=payload.tags,
			is_locked=payload.is_locked,
		)
		await self._enqueue_outbox("group", updated.id, "updated", events.group_payload(updated))
		return self._group_to_response(updated, role=membership.role if membership else None)

	async def delete_group(self, user: AuthenticatedUser, group_id: UUID) -> None:
		group, membership = await self._ensure_group_visible(group_id, user)
		policies.assert_is_owner(membership.role if membership else None)
		await self.repo.soft_delete_group(group_id)
		group.deleted_at = datetime.now(timezone.utc)
		await self._enqueue_outbox("group", group.id, "deleted", events.group_payload(group))

	async def list_groups(self, *, limit: int = 20, offset: int = 0) -> dto.GroupListResponse:
		groups = await self.repo.list_groups_public(limit=limit, offset=offset)
		return dto.GroupListResponse(items=[self._group_to_response(group, role=None) for group in groups])

	# ------------------------------------------------------------------
	# Feed operations

	async def get_user_feed(
		self,
		user: AuthenticatedUser,
		*,
		limit: int,
		after: str | None = None,
	) -> dto.FeedListResponse:
		policies.ensure_cursor_limit(limit)
		entries, next_cursor = await self.feed_query.get_user_feed(UUID(user.id), limit=limit, after=after)
		return dto.FeedListResponse(
			items=[
				dto.FeedEntryResponse(
					post_id=entry.post_id,
					group_id=entry.group_id,
					rank_score=entry.rank_score,
					inserted_at=entry.inserted_at,
				)
				for entry in entries
			],
			next_cursor=next_cursor,
		)

	async def get_group_feed(
		self,
		user: AuthenticatedUser,
		group_id: UUID,
		*,
		limit: int,
		after: str | None = None,
	) -> dto.PostListResponse:
		group, _membership = await self._ensure_group_visible(group_id, user)
		policies.ensure_cursor_limit(limit)
		posts, next_cursor = await self.feed_query.get_group_feed(group, limit=limit, after=after)
		return dto.PostListResponse(
			items=[self._post_to_response(post) for post in posts],
			next_cursor=next_cursor,
		)

	async def enqueue_feed_rebuild(self, payload: dto.FeedRebuildRequest) -> dto.FeedRebuildResponse:
		await feed_cache.enqueue_rebuild(payload.owner_id)
		return dto.FeedRebuildResponse(enqueued=True)

	# ------------------------------------------------------------------
	# Member operations

	async def join_group(self, user: AuthenticatedUser, group_id: UUID) -> dto.MemberResponse:
		group = await self.repo.get_group(group_id)
		if group is None or group.deleted_at is not None:
			raise NotFoundError("group_not_found")
		membership = await self.repo.get_member(group_id, UUID(user.id))
		if membership:
			policies.ensure_not_banned(membership)
			return self._member_to_response(membership)
		if group.visibility in {"private", "secret"}:
			raise ForbiddenError("approval_required")
		member = await self.repo.upsert_member(group_id, UUID(user.id), role="member")
		return self._member_to_response(member)

	async def update_member(
		self,
		user: AuthenticatedUser,
		group_id: UUID,
		target_user: UUID,
		payload: dto.MemberUpdateRequest,
	) -> dto.MemberResponse:
		group, membership = await self._ensure_group_visible(group_id, user)
		policies.assert_can_moderate(membership.role if membership else None)
		target_member = await self.repo.get_member(group_id, target_user)
		if not target_member:
			raise NotFoundError("member_not_found")
		if not policies.can_manage_member(membership.role, target_member.role):
			raise ForbiddenError("insufficient_role_rank")
		if payload.role is not None:
			policies.ensure_role_valid(payload.role)
		member = await self.repo.update_member_properties(
			group_id,
			target_user,
			role=payload.role,
			muted_until=payload.muted_until,
			is_banned=payload.is_banned,
		)
		return self._member_to_response(member)

	async def remove_member(
		self,
		user: AuthenticatedUser,
		group_id: UUID,
		target_user: UUID,
	) -> None:
		group, membership = await self._ensure_group_visible(group_id, user)
		policies.assert_can_moderate(membership.role if membership else None)
		target_member = await self.repo.get_member(group_id, target_user)
		if not target_member:
			raise NotFoundError("member_not_found")
		if not policies.can_manage_member(membership.role, target_member.role):
			raise ForbiddenError("insufficient_role_rank")
		await self.repo.delete_member(group_id, target_user)

	# ------------------------------------------------------------------
	# Post operations

	async def list_posts(
		self,
		user: AuthenticatedUser,
		group_id: UUID,
		*,
		limit: int,
		after: Optional[str] = None,
		before: Optional[str] = None,
	) -> dto.PostListResponse:
		group, membership = await self._ensure_group_visible(group_id, user)
		policies.ensure_cursor_limit(limit)
		after_cursor = repo_module.decode_cursor(after) if after else None
		before_cursor = repo_module.decode_cursor(before) if before else None
		posts, next_cursor = await self.repo.list_posts(
			group_id,
			limit=limit,
			after=after_cursor,
			before=before_cursor,
		)
		return dto.PostListResponse(items=[self._post_to_response(post) for post in posts], next_cursor=next_cursor)

	async def create_post(
		self,
		user: AuthenticatedUser,
		group_id: UUID,
		payload: dto.PostCreateRequest,
		*,
		idempotency_key: str | None = None,
	) -> dto.PostResponse:
		group, membership = await self._ensure_group_visible(group_id, user)
		policies.assert_can_post(group, is_member=membership is not None)
		policies.ensure_member_can_post(membership)
		policies.ensure_body_limits(title=payload.title, body=payload.body, body_limit=40000)
		policies.ensure_topic_tag_length(payload.topic_tags)
		await self.repo.ensure_tags(payload.topic_tags)
		key = policies.ensure_idempotency_key(idempotency_key)
		body_hash = idempotency.compute_hash(body=payload.model_dump())
		gate = get_write_gate()
		ctx = await gate.enforce(user_id=str(user.id), surface="post", ctx=WriteContext(text=payload.body))
		body_for_storage = payload.body
		if ctx.strip_links:
			body_for_storage = _strip_external_links(body_for_storage)
		moderation_meta = _build_moderation_meta(ctx)
		shadowed = bool(moderation_meta and moderation_meta.get("shadowed"))

		async def _producer() -> dto.PostResponse:
			post = await self.repo.create_post(
				group_id=group_id,
				author_id=UUID(user.id),
				title=payload.title,
				body=body_for_storage,
				topic_tags=payload.topic_tags,
			)
			if not shadowed:
				await self._enqueue_outbox("post", post.id, "created", events.post_payload(post))
				await redis_streams.publish_post_event(
					"created",
					post_id=str(post.id),
					group_id=str(post.group_id),
					actor_id=user.id,
				)
				obs_metrics.inc_community_posts_created()
			return self._post_to_response(post, moderation=moderation_meta)

		return await idempotency.resolve(
			key=key,
			body_hash=body_hash,
			producer=_producer,
			serializer=lambda response: response.model_dump(mode="json"),
			deserializer=lambda raw: dto.PostResponse.model_validate(raw),
		)

	async def get_post(self, user: AuthenticatedUser, post_id: UUID) -> dto.PostResponse:
		post = await self.repo.get_post(post_id)
		if not post:
			raise NotFoundError("post_not_found")
		group, membership = await self._ensure_group_visible(post.group_id, user)
		can_moderate = bool(
			membership and policies.ROLE_HIERARCHY.get(membership.role, 0) >= policies.ROLE_HIERARCHY["moderator"]
		)
		policies.require_post_visibility(post, can_moderate=can_moderate)
		return self._post_to_response(post)

	async def update_post(
		self,
		user: AuthenticatedUser,
		post_id: UUID,
		payload: dto.PostUpdateRequest,
	) -> dto.PostResponse:
		post = await self.repo.get_post(post_id)
		if not post:
			raise NotFoundError("post_not_found")
		group, membership = await self._ensure_group_visible(post.group_id, user)
		can_moderate = bool(
			membership and policies.ROLE_HIERARCHY.get(membership.role, 0) >= policies.ROLE_HIERARCHY["moderator"]
		)
		if str(post.author_id) != user.id and not can_moderate:
			raise ForbiddenError("not_author")
		if payload.topic_tags is not None:
			policies.ensure_topic_tag_length(payload.topic_tags)
			await self.repo.ensure_tags(payload.topic_tags)
		if payload.body is not None:
			policies.ensure_body_limits(title=payload.title or post.title, body=payload.body, body_limit=40000)
		updated = await self.repo.update_post(
			post_id,
			title=payload.title,
			body=payload.body,
			topic_tags=payload.topic_tags,
			is_pinned=payload.is_pinned,
		)
		await self._enqueue_outbox("post", updated.id, "updated", events.post_payload(updated))
		return self._post_to_response(updated)

	async def delete_post(self, user: AuthenticatedUser, post_id: UUID) -> None:
		post = await self.repo.get_post(post_id)
		if not post:
			raise NotFoundError("post_not_found")
		group, membership = await self._ensure_group_visible(post.group_id, user)
		can_moderate = bool(
			membership and policies.ROLE_HIERARCHY.get(membership.role, 0) >= policies.ROLE_HIERARCHY["moderator"]
		)
		if str(post.author_id) != user.id and not can_moderate:
			raise ForbiddenError("not_author")
		deleted = await self.repo.soft_delete_post(post_id)
		await self._enqueue_outbox("post", deleted.id, "deleted", events.post_payload(deleted))
		await redis_streams.publish_post_event(
			"deleted",
			post_id=str(post_id),
			group_id=str(post.group_id),
			actor_id=user.id,
		)

	async def pin_post(self, user: AuthenticatedUser, post_id: UUID, *, state: bool) -> dto.PostResponse:
		post = await self.repo.get_post(post_id)
		if not post:
			raise NotFoundError("post_not_found")
		group, membership = await self._ensure_group_visible(post.group_id, user)
		policies.assert_can_moderate(membership.role if membership else None)
		updated = await self.repo.update_post(post_id, title=None, body=None, topic_tags=None, is_pinned=state)
		await self._enqueue_outbox("post", updated.id, "updated", events.post_payload(updated))
		return self._post_to_response(updated)

	# ------------------------------------------------------------------
	# Comment operations

	async def list_comments(
		self,
		user: AuthenticatedUser,
		post_id: UUID,
		*,
		limit: int,
		after: Optional[str] = None,
		before: Optional[str] = None,
	) -> dto.CommentListResponse:
		post = await self.repo.get_post(post_id)
		if not post:
			raise NotFoundError("post_not_found")
		group, membership = await self._ensure_group_visible(post.group_id, user)
		can_moderate = bool(
			membership and policies.ROLE_HIERARCHY.get(membership.role, 0) >= policies.ROLE_HIERARCHY["moderator"]
		)
		policies.require_post_visibility(post, can_moderate=can_moderate)
		policies.ensure_cursor_limit(limit)
		after_cursor = repo_module.decode_cursor(after) if after else None
		before_cursor = repo_module.decode_cursor(before) if before else None
		comments, next_cursor = await self.repo.list_comments(post_id, limit=limit, after=after_cursor, before=before_cursor)
		return dto.CommentListResponse(
			items=[self._comment_to_response(comment) for comment in comments],
			next_cursor=next_cursor,
		)

	async def create_comment(
		self,
		user: AuthenticatedUser,
		post_id: UUID,
		payload: dto.CommentCreateRequest,
		*,
		idempotency_key: str | None = None,
	) -> dto.CommentResponse:
		post = await self.repo.get_post(post_id)
		if not post:
			raise NotFoundError("post_not_found")
		group, membership = await self._ensure_group_visible(post.group_id, user)
		policies.ensure_member_can_post(membership)
		policies.ensure_body_limits(title=None, body=payload.body, body_limit=10000, comment=True)
		depth = 0
		if payload.parent_id:
			parent = await self.repo.get_comment(payload.parent_id)
			if not parent:
				raise NotFoundError("parent_not_found")
			depth = parent.depth + 1
			if depth > 5:
				raise ValidationError("max_depth_exceeded")
		key = policies.ensure_idempotency_key(idempotency_key)
		body_hash = idempotency.compute_hash(body=payload.model_dump())
		gate = get_write_gate()
		ctx = await gate.enforce(user_id=str(user.id), surface="comment", ctx=WriteContext(text=payload.body))
		body_for_storage = payload.body
		if ctx.strip_links:
			body_for_storage = _strip_external_links(body_for_storage)
		moderation_meta = _build_moderation_meta(ctx)
		shadowed = bool(moderation_meta and moderation_meta.get("shadowed"))

		async def _producer() -> dto.CommentResponse:
			comment = await self.repo.create_comment(
				post_id=post_id,
				author_id=UUID(user.id),
				body=body_for_storage,
				parent_id=payload.parent_id,
				depth=depth,
			)
			if not shadowed:
				await self._enqueue_outbox("comment", comment.id, "created", events.comment_payload(comment))
				await redis_streams.publish_comment_event(
					"created",
					comment_id=str(comment.id),
					post_id=str(comment.post_id),
					group_id=str(post.group_id),
					actor_id=user.id,
				)
				obs_metrics.inc_community_comments_created()
			return self._comment_to_response(comment, moderation=moderation_meta)

		return await idempotency.resolve(
			key=key,
			body_hash=body_hash,
			producer=_producer,
			serializer=lambda response: response.model_dump(mode="json"),
			deserializer=lambda raw: dto.CommentResponse.model_validate(raw),
		)

	async def get_comment(self, user: AuthenticatedUser, comment_id: UUID) -> dto.CommentResponse:
		comment = await self.repo.get_comment(comment_id)
		if not comment:
			raise NotFoundError("comment_not_found")
		post = await self.repo.get_post(comment.post_id)
		if not post:
			raise NotFoundError("post_not_found")
		group, membership = await self._ensure_group_visible(post.group_id, user)
		can_moderate = bool(
			membership and policies.ROLE_HIERARCHY.get(membership.role, 0) >= policies.ROLE_HIERARCHY["moderator"]
		)
		policies.require_comment_visibility(comment, can_moderate=can_moderate)
		return self._comment_to_response(comment)

	async def update_comment(
		self,
		user: AuthenticatedUser,
		comment_id: UUID,
		payload: dto.CommentUpdateRequest,
	) -> dto.CommentResponse:
		comment = await self.repo.get_comment(comment_id)
		if not comment:
			raise NotFoundError("comment_not_found")
		post = await self.repo.get_post(comment.post_id)
		if not post:
			raise NotFoundError("post_not_found")
		group, membership = await self._ensure_group_visible(post.group_id, user)
		can_moderate = bool(
			membership and policies.ROLE_HIERARCHY.get(membership.role, 0) >= policies.ROLE_HIERARCHY["moderator"]
		)
		if str(comment.author_id) != user.id and not can_moderate:
			raise ForbiddenError("not_author")
		policies.ensure_body_limits(title=None, body=payload.body, body_limit=10000, comment=True)
		updated = await self.repo.update_comment(comment_id, body=payload.body)
		await self._enqueue_outbox("comment", updated.id, "updated", events.comment_payload(updated))
		return self._comment_to_response(updated)

	async def delete_comment(self, user: AuthenticatedUser, comment_id: UUID) -> None:
		comment = await self.repo.get_comment(comment_id)
		if not comment:
			raise NotFoundError("comment_not_found")
		post = await self.repo.get_post(comment.post_id)
		if not post:
			raise NotFoundError("post_not_found")
		group, membership = await self._ensure_group_visible(post.group_id, user)
		can_moderate = bool(
			membership and policies.ROLE_HIERARCHY.get(membership.role, 0) >= policies.ROLE_HIERARCHY["moderator"]
		)
		if str(comment.author_id) != user.id and not can_moderate:
			raise ForbiddenError("not_author")
		deleted = await self.repo.soft_delete_comment(comment_id)
		await self._enqueue_outbox("comment", deleted.id, "deleted", events.comment_payload(deleted))
		await redis_streams.publish_comment_event(
			"deleted",
			comment_id=str(comment_id),
			post_id=str(post.id),
			group_id=str(post.group_id),
			actor_id=user.id,
		)

	# ------------------------------------------------------------------
	# Reactions

	async def add_reaction(self, user: AuthenticatedUser, payload: dto.ReactionRequest) -> dict[str, Any]:
		reaction = await self.repo.add_reaction(
			subject_type=payload.subject_type,
			subject_id=payload.subject_id,
			user_id=UUID(user.id),
			emoji=payload.emoji,
		)
		await self._enqueue_outbox("reaction", reaction.id, "created", events.reaction_payload(reaction))
		obs_metrics.inc_community_reactions_created()
		return {"ok": True}

	async def remove_reaction(self, user: AuthenticatedUser, payload: dto.ReactionRequest) -> dict[str, Any]:
		await self.repo.remove_reaction(
			subject_type=payload.subject_type,
			subject_id=payload.subject_id,
			user_id=UUID(user.id),
			emoji=payload.emoji,
		)
		await self._enqueue_outbox(
			"reaction",
			payload.subject_id,
			"deleted",
			{"subject_type": payload.subject_type, "subject_id": str(payload.subject_id), "emoji": payload.emoji},
		)
		return {"ok": True}

	# ------------------------------------------------------------------
	# Uploads & attachments

	async def presign_upload(
		self,
		user: AuthenticatedUser,
		payload: dto.UploadPresignRequest,
	) -> dto.UploadPresignResponse:
		policies.ensure_mime_allowed(payload.mime)
		policies.ensure_media_size(payload.size_bytes)
		presign = s3.presign_upload(
			user_id=user.id,
			request=s3.PresignRequest(
				mime=payload.mime,
				size_bytes=payload.size_bytes,
				purpose=payload.purpose,
				width=payload.width,
				height=payload.height,
			),
		)
		return dto.UploadPresignResponse(
			key=presign.key,
			url=presign.url,
			fields=presign.fields,
			expires_in=presign.expires_in,
		)

	async def create_attachment(
		self,
		user: AuthenticatedUser,
		payload: dto.AttachmentCreateRequest,
	) -> dto.AttachmentResponse:
		policies.ensure_mime_allowed(payload.mime)
		policies.ensure_media_size(payload.size_bytes)
		if payload.subject_type == "post":
			post = await self.repo.get_post(payload.subject_id)
			if not post:
				raise NotFoundError("post_not_found")
			group, membership = await self._ensure_group_visible(post.group_id, user)
			policies.ensure_member_can_post(membership)
			existing = await self.repo.count_attachments(subject_type="post", subject_id=payload.subject_id)
			policies.ensure_attachment_limits(existing_count=existing, limit=10)
		elif payload.subject_type == "comment":
			comment = await self.repo.get_comment(payload.subject_id)
			if not comment:
				raise NotFoundError("comment_not_found")
			post = await self.repo.get_post(comment.post_id)
			if not post:
				raise NotFoundError("post_not_found")
			group, membership = await self._ensure_group_visible(post.group_id, user)
			policies.ensure_member_can_post(membership)
			existing = await self.repo.count_attachments(subject_type="comment", subject_id=payload.subject_id)
			policies.ensure_attachment_limits(existing_count=existing, limit=3)
		elif payload.subject_type == "group":
			group, membership = await self._ensure_group_visible(payload.subject_id, user)
			policies.assert_can_admin(membership.role if membership else None)
			existing = await self.repo.count_attachments(subject_type="group", subject_id=payload.subject_id)
			policies.ensure_attachment_limits(existing_count=existing, limit=5)
		else:
			raise ValidationError("invalid_subject")
		attachment = await self.repo.create_attachment(
			subject_type=payload.subject_type,
			subject_id=payload.subject_id,
			s3_key=payload.s3_key,
			mime=payload.mime,
			size_bytes=payload.size_bytes,
			width=payload.width,
			height=payload.height,
			created_by=UUID(user.id),
		)
		return dto.AttachmentResponse(**attachment.model_dump())

	# ------------------------------------------------------------------
	# Tags

	async def search_tags(self, query: str) -> dto.TagLookupResponse:
		items = await self.repo.search_tags(query=query)
		return dto.TagLookupResponse(items=items)

	# ------------------------------------------------------------------
	# Outbox helper

	async def _enqueue_outbox(
		self,
		aggregate_type: str,
		aggregate_id: UUID,
		event_type: str,
		payload: dict[str, Any],
	) -> None:
		async def _execute(conn: asyncpg.Connection) -> None:
			await self.repo.enqueue_outbox(
				conn=conn,
				aggregate_type=aggregate_type,
				aggregate_id=aggregate_id,
				event_type=event_type,
				payload=payload,
			)

		await self._with_conn(_execute)
