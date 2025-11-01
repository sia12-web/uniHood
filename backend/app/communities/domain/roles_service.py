"""Role management for communities groups."""

from __future__ import annotations

from uuid import UUID

from app.communities.domain import policies, repo as repo_module
from app.communities.domain.exceptions import ForbiddenError, NotFoundError
from app.communities.schemas import dto
from app.infra.auth import AuthenticatedUser


class RolesService:
	"""Handles role listing and assignment within a group."""

	def __init__(self, *, repository: repo_module.CommunitiesRepository | None = None) -> None:
		self.repo = repository or repo_module.CommunitiesRepository()

	async def list_roles(self, user: AuthenticatedUser, group_id: UUID) -> list[dto.MemberResponse]:
		group = await self.repo.get_group(group_id)
		if not group or group.deleted_at is not None:
			raise NotFoundError("group_not_found")
		membership = await self.repo.get_member(group_id, UUID(user.id))
		policies.assert_can_moderate(membership.role if membership else None)
		members = await self.repo.list_members(group_id)
		return [dto.MemberResponse(**member.model_dump()) for member in members]

	async def assign_role(
		self,
		user: AuthenticatedUser,
		group_id: UUID,
		payload: dto.RoleAssignmentRequest,
	) -> dto.MemberResponse:
		group = await self.repo.get_group(group_id)
		if not group or group.deleted_at is not None:
			raise NotFoundError("group_not_found")
		actor_membership = await self.repo.get_member(group_id, UUID(user.id))
		policies.assert_can_admin(actor_membership.role if actor_membership else None)
		target_member = await self.repo.get_member(group_id, payload.user_id)
		if not target_member:
			raise NotFoundError("member_not_found")
		policies.ensure_role_transition(actor_membership.role if actor_membership else None, target_member.role, payload.role)
		updated = await self.repo.update_member_properties(group_id, payload.user_id, role=payload.role)
		await self.repo.record_audit_event(
			group_id=group_id,
			user_id=UUID(user.id),
			action="role.assign",
			details={
				"target_user_id": str(payload.user_id),
				"role": payload.role,
			},
		)
		return dto.MemberResponse(**updated.model_dump())
