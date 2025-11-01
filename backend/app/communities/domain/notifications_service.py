"""Service helpers for communities notifications."""

from __future__ import annotations

from datetime import datetime
from typing import Iterable, Optional
from uuid import UUID

from app.communities.domain import repo as repo_module
from app.communities.domain.models import NotificationEntity
from app.communities.schemas import dto
from app.infra.auth import AuthenticatedUser
from app.obs import metrics as obs_metrics

_DEDUPE_WINDOW_SECONDS = 600
_RETENTION_DAYS = 90


class NotificationService:
	"""Encapsulates notification persistence and queries."""

	def __init__(self, *, repository: repo_module.CommunitiesRepository | None = None) -> None:
		self.repo = repository or repo_module.CommunitiesRepository()

	@staticmethod
	def to_response(entity: NotificationEntity) -> dto.NotificationResponse:
		return dto.NotificationResponse(
			id=entity.id,
			user_id=entity.user_id,
			type=entity.type,
			ref_id=entity.ref_id,
			actor_id=entity.actor_id,
			payload=entity.payload,
			is_read=entity.is_read,
			is_delivered=entity.is_delivered,
			created_at=entity.created_at,
		)

	async def list_notifications(
		self,
		user: AuthenticatedUser,
		*,
		limit: int,
		cursor: Optional[str] = None,
	) -> dto.NotificationListResponse:
		limit = max(1, min(limit, 50))
		after = repo_module.decode_notification_cursor(cursor) if cursor else None
		items, next_cursor = await self.repo.list_notifications(UUID(user.id), limit=limit, after=after)
		return dto.NotificationListResponse(
			items=[self.to_response(item) for item in items],
			next_cursor=next_cursor,
		)

	async def mark_notifications(
		self,
		user: AuthenticatedUser,
		payload: dto.NotificationMarkReadRequest,
	) -> int:
		ids = [int(item) for item in payload.ids]
		updated = await self.repo.mark_notifications_read(
			UUID(user.id),
			ids=ids,
			mark_read=payload.mark_read,
		)
		result = "read" if payload.mark_read else "unread"
		obs_metrics.comm_notification_persisted(result)
		return updated

	async def unread_count(self, user: AuthenticatedUser) -> dto.NotificationUnreadResponse:
		count = await self.repo.get_unread_count(UUID(user.id))
		return dto.NotificationUnreadResponse(count=count)

	async def persist_notification(
		self,
		*,
		user_id: UUID,
		type: str,
		ref_id: UUID,
		actor_id: UUID,
		payload: dict,
		max_per_second: int = 5,
	) -> tuple[NotificationEntity | None, bool]:
		entity, created = await self.repo.insert_notification(
			user_id=user_id,
			type=type,
			ref_id=ref_id,
			actor_id=actor_id,
			payload=payload,
			dedupe_window_seconds=_DEDUPE_WINDOW_SECONDS,
			max_per_second=max_per_second,
		)
		obs_metrics.comm_notification_persisted("created" if created else "skipped")
		return entity, created

	async def prune_retained(self, *, now: datetime | None = None) -> int:
		return await self.repo.prune_old_notifications(older_than_days=_RETENTION_DAYS)


async def persist_bulk(
	service: NotificationService,
	*,
	user_ids: Iterable[UUID],
	type: str,
	ref_id: UUID,
	actor_id: UUID,
	payload: dict,
	max_per_second: int = 5,
) -> int:
	"""Persist notifications for many recipients, returning number created."""
	created = 0
	for user_id in user_ids:
		if user_id == actor_id:
			continue
		entity, was_created = await service.persist_notification(
			user_id=user_id,
			type=type,
			ref_id=ref_id,
			actor_id=actor_id,
			payload=payload,
			max_per_second=max_per_second,
		)
		if was_created and entity is not None:
			created += 1
	return created
