from __future__ import annotations

from datetime import datetime, timezone
from uuid import UUID, uuid4

import pytest

import app.communities.domain.services as services_module
import app.communities.infra.redis_streams as redis_streams
from app.communities.domain import models
from app.communities.domain.exceptions import ForbiddenError
from app.communities.domain.services import CommunitiesService
from app.communities.schemas import dto
from app.infra.auth import AuthenticatedUser
from app.moderation.middleware.write_gate_v2 import WriteContext


@pytest.mark.asyncio
async def test_presign_upload_generates_key():
	service = CommunitiesService()
	user_id = str(uuid4())
	user = AuthenticatedUser(id=user_id, campus_id="campus-1")
	payload = dto.UploadPresignRequest(mime="image/png", size_bytes=1024, purpose="post")

	response = await service.presign_upload(user, payload)

	assert response.key.startswith(f"communities/post/{user_id}/")
	assert response.url.endswith(response.key)
	assert response.expires_in == 900


class _FakeAttachmentRepo:
	def __init__(self, *, existing: int) -> None:
		self.group_id = uuid4()
		self.post_id = uuid4()
		self.member_id = uuid4()
		self.group = models.Group(
			id=self.group_id,
			campus_id=None,
			name="Group",
			slug="group",
			description="",
			visibility="public",
			tags=[],
			avatar_key=None,
			cover_key=None,
			is_locked=False,
			created_by=self.member_id,
			created_at=datetime.now(timezone.utc),
			updated_at=datetime.now(timezone.utc),
			deleted_at=None,
		)
		self.member = models.GroupMember(
			id=uuid4(),
			group_id=self.group_id,
			user_id=self.member_id,
			role="member",
			joined_at=datetime.now(timezone.utc),
			muted_until=None,
			is_banned=False,
			created_at=datetime.now(timezone.utc),
			updated_at=datetime.now(timezone.utc),
		)
		self.post = models.Post(
			id=self.post_id,
			group_id=self.group_id,
			author_id=self.member_id,
			title="Hello",
			body="World",
			topic_tags=[],
			media_count=0,
			reactions_count=0,
			comments_count=0,
			is_pinned=False,
			created_at=datetime.now(timezone.utc),
			updated_at=datetime.now(timezone.utc),
			deleted_at=None,
		)
		self.existing = existing
		self.created_payload: dto.AttachmentCreateRequest | None = None

	async def get_post(self, post_id: UUID) -> models.Post | None:
		return self.post if post_id == self.post_id else None

	async def get_group(self, group_id: UUID) -> models.Group | None:
		return self.group if group_id == self.group_id else None

	async def get_member(self, group_id: UUID, user_id: UUID) -> models.GroupMember | None:
		if group_id == self.group_id and user_id == self.member_id:
			return self.member
		return None

	async def count_attachments(self, *, subject_type: str, subject_id: UUID) -> int:
		return self.existing

	async def create_attachment(
		self,
		*,
		subject_type: str,
		subject_id: UUID,
		s3_key: str,
		mime: str,
		size_bytes: int,
		width: int | None,
		height: int | None,
		created_by: UUID,
	) -> models.MediaAttachment:
		self.created_payload = dto.AttachmentCreateRequest(
			subject_type=subject_type,
			subject_id=subject_id,
			s3_key=s3_key,
			mime=mime,
			size_bytes=size_bytes,
			width=width,
			height=height,
		)
		return models.MediaAttachment(
			id=uuid4(),
			subject_type=subject_type,
			subject_id=subject_id,
			s3_key=s3_key,
			mime=mime,
			size_bytes=size_bytes,
			width=width,
			height=height,
			created_by=created_by,
			created_at=datetime.now(timezone.utc),
		)


class _FakePostRepo:
	def __init__(self) -> None:
		now = datetime.now(timezone.utc)
		self.group_id = uuid4()
		self.member_id = uuid4()
		self.group = models.Group(
			id=self.group_id,
			campus_id=None,
			name="Group",
			slug="group",
			description="desc",
			visibility="public",
			tags=[],
			avatar_key=None,
			cover_key=None,
			is_locked=False,
			created_by=self.member_id,
			created_at=now,
			updated_at=now,
			deleted_at=None,
		)
		self.member = models.GroupMember(
			id=uuid4(),
			group_id=self.group_id,
			user_id=self.member_id,
			role="member",
			joined_at=now,
			muted_until=None,
			is_banned=False,
			created_at=now,
			updated_at=now,
		)
		self.created_body: str | None = None
		self.tags_called: list[str] | None = None
		self.last_post: models.Post | None = None
		self.created_comment_body: str | None = None
		self.last_comment: models.Comment | None = None

	async def get_group(self, group_id: UUID) -> models.Group | None:
		return self.group if group_id == self.group_id else None

	async def get_member(self, group_id: UUID, user_id: UUID) -> models.GroupMember | None:
		if group_id == self.group_id and user_id == self.member_id:
			return self.member
		return None

	async def ensure_tags(self, tags: list[str]) -> None:
		self.tags_called = list(tags)

	async def create_post(
		self,
		*,
		group_id: UUID,
		author_id: UUID,
		title: str | None,
		body: str,
		topic_tags: list[str],
	) -> models.Post:
		self.created_body = body
		now = datetime.now(timezone.utc)
		post = models.Post(
			id=uuid4(),
			group_id=group_id,
			author_id=author_id,
			title=title,
			body=body,
			topic_tags=list(topic_tags),
			media_count=0,
			reactions_count=0,
			comments_count=0,
			is_pinned=False,
			created_at=now,
			updated_at=now,
			deleted_at=None,
		)
		self.last_post = post
		return post

	async def get_post(self, post_id: UUID) -> models.Post | None:
		return self.last_post if self.last_post and self.last_post.id == post_id else None

	async def get_comment(self, comment_id: UUID) -> models.Comment | None:
		if self.last_comment and self.last_comment.id == comment_id:
			return self.last_comment
		return None

	async def create_comment(
		self,
		*,
		post_id: UUID,
		author_id: UUID,
		body: str,
		parent_id: UUID | None,
		depth: int,
	) -> models.Comment:
		now = datetime.now(timezone.utc)
		comment = models.Comment(
			id=uuid4(),
			post_id=post_id,
			author_id=author_id,
			parent_id=parent_id,
			body=body,
			depth=depth,
			reactions_count=0,
			created_at=now,
			updated_at=now,
			deleted_at=None,
		)
		self.created_comment_body = body
		self.last_comment = comment
		return comment


@pytest.mark.asyncio
async def test_create_attachment_respects_limit():
	repo = _FakeAttachmentRepo(existing=10)
	service = CommunitiesService(repository=repo)
	user = AuthenticatedUser(id=str(repo.member_id), campus_id="campus-1")
	payload = dto.AttachmentCreateRequest(
		subject_type="post",
		subject_id=repo.post_id,
		s3_key="key",
		mime="image/png",
		size_bytes=2048,
		width=None,
		height=None,
	)

	with pytest.raises(ForbiddenError):
		await service.create_attachment(user, payload)


@pytest.mark.asyncio
async def test_create_attachment_success_under_limit():
	repo = _FakeAttachmentRepo(existing=0)
	service = CommunitiesService(repository=repo)
	user = AuthenticatedUser(id=str(repo.member_id), campus_id="campus-1")
	payload = dto.AttachmentCreateRequest(
		subject_type="post",
		subject_id=repo.post_id,
		s3_key="key",
		mime="image/png",
		size_bytes=2048,
		width=800,
		height=600,
	)

	response = await service.create_attachment(user, payload)

	assert response.subject_id == repo.post_id
	assert repo.created_payload is not None
	assert repo.created_payload.s3_key == "key"


@pytest.mark.asyncio
async def test_create_post_applies_link_cooloff(monkeypatch):
	repo = _FakePostRepo()
	service = CommunitiesService(repository=repo)

	call_state = {"outbox": False, "publish": 0, "metric": 0}

	async def stub_enqueue_outbox(*args, **kwargs):
		call_state["outbox"] = True

	async def stub_publish_post_event(*args, **kwargs):
		call_state["publish"] += 1

	def stub_inc_metric() -> None:
		call_state["metric"] += 1

	monkeypatch.setattr(service, "_enqueue_outbox", stub_enqueue_outbox)
	monkeypatch.setattr(redis_streams, "publish_post_event", stub_publish_post_event)
	monkeypatch.setattr(services_module.obs_metrics, "inc_community_posts_created", stub_inc_metric)

	class StubGate:
		async def enforce(self, *, user_id: str, surface: str, ctx: WriteContext) -> WriteContext:
			assert surface == "post"
			ctx.strip_links = True
			ctx.metadata["link_cooloff"] = True
			return ctx

	monkeypatch.setattr(services_module, "get_write_gate", lambda: StubGate())

	user = AuthenticatedUser(id=str(repo.member_id), campus_id="campus-1")
	payload = dto.PostCreateRequest(title="Title", body="visit https://example.com", topic_tags=["tag1"])

	response = await service.create_post(user, repo.group_id, payload)

	assert repo.created_body == "visit [link removed]"
	assert repo.tags_called == ["tag1"]
	assert response.body == "visit [link removed]"
	assert response.moderation == {"links_stripped": True, "link_cooloff": True}
	assert call_state["outbox"] is True
	assert call_state["publish"] == 1
	assert call_state["metric"] == 1


@pytest.mark.asyncio
async def test_create_post_shadowed_suppresses_events(monkeypatch):
	repo = _FakePostRepo()
	service = CommunitiesService(repository=repo)

	call_state = {"outbox": False, "publish": 0, "metric": 0}

	async def stub_enqueue_outbox(*args, **kwargs):
		call_state["outbox"] = True

	async def stub_publish_post_event(*args, **kwargs):
		call_state["publish"] += 1

	def stub_inc_metric() -> None:
		call_state["metric"] += 1

	monkeypatch.setattr(service, "_enqueue_outbox", stub_enqueue_outbox)
	monkeypatch.setattr(redis_streams, "publish_post_event", stub_publish_post_event)
	monkeypatch.setattr(services_module.obs_metrics, "inc_community_posts_created", stub_inc_metric)

	class ShadowGate:
		async def enforce(self, *, user_id: str, surface: str, ctx: WriteContext) -> WriteContext:
			assert surface == "post"
			ctx.shadow = True
			return ctx

	monkeypatch.setattr(services_module, "get_write_gate", lambda: ShadowGate())

	user = AuthenticatedUser(id=str(repo.member_id), campus_id="campus-1")
	payload = dto.PostCreateRequest(title="Title", body="hello world", topic_tags=[])

	response = await service.create_post(user, repo.group_id, payload)

	assert repo.created_body == "hello world"
	assert response.moderation == {"shadowed": True}
	assert call_state["outbox"] is False
	assert call_state["publish"] == 0
	assert call_state["metric"] == 0


@pytest.mark.asyncio
async def test_create_comment_applies_link_cooloff(monkeypatch):
	repo = _FakePostRepo()
	service = CommunitiesService(repository=repo)

	post = await repo.create_post(
		group_id=repo.group_id,
		author_id=repo.member_id,
		title="Seed",
		body="Seed",
		topic_tags=[],
	)

	call_state = {"outbox": False, "publish": 0, "metric": 0}

	async def stub_enqueue_outbox(*args, **kwargs):
		call_state["outbox"] = True

	async def stub_publish_comment_event(*args, **kwargs):
		call_state["publish"] += 1

	def stub_inc_comment_metric() -> None:
		call_state["metric"] += 1

	monkeypatch.setattr(service, "_enqueue_outbox", stub_enqueue_outbox)
	monkeypatch.setattr(redis_streams, "publish_comment_event", stub_publish_comment_event)
	monkeypatch.setattr(services_module.obs_metrics, "inc_community_comments_created", stub_inc_comment_metric)

	class StubGate:
		async def enforce(self, *, user_id: str, surface: str, ctx: WriteContext) -> WriteContext:
			assert surface == "comment"
			ctx.strip_links = True
			ctx.metadata["link_cooloff"] = True
			return ctx

	monkeypatch.setattr(services_module, "get_write_gate", lambda: StubGate())

	user = AuthenticatedUser(id=str(repo.member_id), campus_id="campus-1")
	payload = dto.CommentCreateRequest(body="see https://example.com")

	response = await service.create_comment(user, post.id, payload)

	assert repo.created_comment_body == "see [link removed]"
	assert response.body == "see [link removed]"
	assert response.moderation == {"links_stripped": True, "link_cooloff": True}
	assert call_state["outbox"] is True
	assert call_state["publish"] == 1
	assert call_state["metric"] == 1


@pytest.mark.asyncio
async def test_create_comment_shadowed_suppresses_events(monkeypatch):
	repo = _FakePostRepo()
	service = CommunitiesService(repository=repo)

	post = await repo.create_post(
		group_id=repo.group_id,
		author_id=repo.member_id,
		title="Seed",
		body="Seed",
		topic_tags=[],
	)

	call_state = {"outbox": False, "publish": 0, "metric": 0}

	async def stub_enqueue_outbox(*args, **kwargs):
		call_state["outbox"] = True

	async def stub_publish_comment_event(*args, **kwargs):
		call_state["publish"] += 1

	def stub_inc_comment_metric() -> None:
		call_state["metric"] += 1

	monkeypatch.setattr(service, "_enqueue_outbox", stub_enqueue_outbox)
	monkeypatch.setattr(redis_streams, "publish_comment_event", stub_publish_comment_event)
	monkeypatch.setattr(services_module.obs_metrics, "inc_community_comments_created", stub_inc_comment_metric)

	class ShadowGate:
		async def enforce(self, *, user_id: str, surface: str, ctx: WriteContext) -> WriteContext:
			assert surface == "comment"
			ctx.shadow = True
			return ctx

	monkeypatch.setattr(services_module, "get_write_gate", lambda: ShadowGate())

	user = AuthenticatedUser(id=str(repo.member_id), campus_id="campus-1")
	payload = dto.CommentCreateRequest(body="hello there")

	response = await service.create_comment(user, post.id, payload)

	assert repo.created_comment_body == "hello there"
	assert response.moderation == {"shadowed": True}
	assert call_state["outbox"] is False
	assert call_state["publish"] == 0
	assert call_state["metric"] == 0
