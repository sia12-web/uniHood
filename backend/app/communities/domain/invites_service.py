"""Invitation flows for communities groups."""

from __future__ import annotations

from uuid import UUID

from app.communities.domain import policies, repo as repo_module
from app.communities.domain.exceptions import NotFoundError
from app.communities.schemas import dto
from app.infra.auth import AuthenticatedUser


class InvitesService:
	"""Create and list invites for group membership."""

	def __init__(self, *, repository: repo_module.CommunitiesRepository | None = None) -> None:
		self.repo = repository or repo_module.CommunitiesRepository()

	async def list_invites(self, user: AuthenticatedUser, group_id: UUID) -> list[dto.InviteResponse]:
		group = await self.repo.get_group(group_id)
		if not group or group.deleted_at is not None:
			raise NotFoundError("group_not_found")
		membership = await self.repo.get_member(group_id, UUID(user.id))
		policies.assert_can_moderate(membership.role if membership else None)
		invites = await self.repo.list_group_invites(group_id)
		return [dto.InviteResponse(**invite.model_dump()) for invite in invites]

	async def create_invite(
		self,
		user: AuthenticatedUser,
		group_id: UUID,
		payload: dto.InviteCreateRequest,
	) -> dto.InviteResponse:
		group = await self.repo.get_group(group_id)
		if not group or group.deleted_at is not None:
			raise NotFoundError("group_not_found")
		membership = await self.repo.get_member(group_id, UUID(user.id))
		policies.assert_can_admin(membership.role if membership else None)
		policies.ensure_can_invite(membership.role if membership else None, payload.role)
		invite = await self.repo.create_group_invite(
			group_id=group_id,
			invited_user_id=payload.user_id,
			invited_by=UUID(user.id),
			role=payload.role,
			expires_at=payload.expires_at,
		)
		await self.repo.record_audit_event(
			group_id=group_id,
			user_id=UUID(user.id),
			action="invite.create",
			details={
				"invited_user_id": str(payload.user_id),
				"role": payload.role,
				"expires_at": payload.expires_at.isoformat() if payload.expires_at else None,
			},
		)
		return dto.InviteResponse(**invite.model_dump())

	async def accept_invite(self, invite_id: UUID, user: AuthenticatedUser) -> dto.InviteResponse:
		invite = await self.repo.accept_group_invite(invite_id, subject_user=UUID(user.id))
		return dto.InviteResponse(**invite.model_dump())
