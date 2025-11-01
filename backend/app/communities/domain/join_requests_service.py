"""Join request moderation flows for communities."""

from __future__ import annotations

from uuid import UUID

from app.communities.domain import policies, repo as repo_module
from app.communities.domain.exceptions import ForbiddenError, NotFoundError
from app.communities.schemas import dto
from app.infra.auth import AuthenticatedUser


class JoinRequestsService:
	"""Handles submission and moderation of join requests."""

	def __init__(self, *, repository: repo_module.CommunitiesRepository | None = None) -> None:
		self.repo = repository or repo_module.CommunitiesRepository()

	async def submit(
		self,
		user: AuthenticatedUser,
		group_id: UUID,
		payload: dto.JoinRequestCreateRequest,
	) -> dto.JoinRequestResponse:
		group = await self.repo.get_group(group_id)
		if not group or group.deleted_at is not None:
			raise NotFoundError("group_not_found")
		membership = await self.repo.get_member(group_id, UUID(user.id))
		if membership:
			raise ForbiddenError("already_member")
		join_request = await self.repo.create_join_request(
			group_id=group_id,
			user_id=UUID(user.id),
			message=payload.message,
		)
		await self.repo.record_audit_event(
			group_id=group_id,
			user_id=UUID(user.id),
			action="join.request",
			details={"message": payload.message} if payload.message else None,
		)
		return dto.JoinRequestResponse(**join_request.model_dump())

	async def list_requests(
		self,
		user: AuthenticatedUser,
		group_id: UUID,
		status: str | None = None,
	) -> list[dto.JoinRequestResponse]:
		membership = await self.repo.get_member(group_id, UUID(user.id))
		policies.assert_can_moderate(membership.role if membership else None)
		requests = await self.repo.list_join_requests(group_id, status=status)
		return [dto.JoinRequestResponse(**item.model_dump()) for item in requests]

	async def review(
		self,
		user: AuthenticatedUser,
		request_id: UUID,
		status: str,
	) -> dto.JoinRequestResponse:
		ORIGINAL_STATUS = {"approved", "rejected"}
		if status not in ORIGINAL_STATUS:
			raise ForbiddenError("invalid_status")
		request = await self.repo.review_join_request(
			request_id,
			actor_id=UUID(user.id),
			status=status,
		)
		await self.repo.record_audit_event(
			group_id=request.group_id,
			user_id=UUID(user.id),
			action=f"join.{status}",
			details={"request_id": str(request_id)},
		)
		return dto.JoinRequestResponse(**request.model_dump())
