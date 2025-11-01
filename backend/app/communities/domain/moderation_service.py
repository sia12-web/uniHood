"""Moderation helpers for bans and mutes in communities."""

from __future__ import annotations

from uuid import UUID

from app.communities.domain import policies, repo as repo_module
from app.communities.domain.exceptions import NotFoundError
from app.communities.schemas import dto
from app.infra.auth import AuthenticatedUser


class ModerationService:
	"""Apply bans and mutes with audit logging."""

	def __init__(self, *, repository: repo_module.CommunitiesRepository | None = None) -> None:
		self.repo = repository or repo_module.CommunitiesRepository()

	async def list_bans(self, user: AuthenticatedUser, group_id: UUID) -> list[dto.MemberResponse]:
		membership = await self.repo.get_member(group_id, UUID(user.id))
		policies.assert_can_moderate(membership.role if membership else None)
		members = await self.repo.list_banned_or_muted_members(group_id)
		return [dto.MemberResponse(**member.model_dump()) for member in members]

	async def apply(
		self,
		user: AuthenticatedUser,
		group_id: UUID,
		payload: dto.BanMuteRequest,
	) -> dto.MemberResponse:
		membership = await self.repo.get_member(group_id, UUID(user.id))
		policies.assert_can_moderate(membership.role if membership else None)
		target = await self.repo.get_member(group_id, payload.user_id)
		if not target:
			raise NotFoundError("member_not_found")
		policies.ensure_can_moderate_members(membership.role if membership else None, target.role)
		updated = await self.repo.update_member_properties(
			group_id,
			payload.user_id,
			is_banned=payload.is_banned,
			muted_until=payload.muted_until,
		)
		action = "ban" if payload.is_banned else "mute"
		await self.repo.record_audit_event(
			group_id=group_id,
			user_id=UUID(user.id),
			action=f"moderation.{action}",
			details={
				"target_user_id": str(payload.user_id),
				"is_banned": payload.is_banned,
				"muted_until": payload.muted_until.isoformat() if payload.muted_until else None,
			},
		)
		return dto.MemberResponse(**updated.model_dump())