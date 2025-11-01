"""Escalation helpers for communities moderation."""

from __future__ import annotations

from uuid import UUID

from app.communities.domain import policies, repo as repo_module
from app.communities.schemas import dto
from app.infra.auth import AuthenticatedUser


class EscalationService:
	"""Allows moderators to escalate issues for staff review."""

	def __init__(self, *, repository: repo_module.CommunitiesRepository | None = None) -> None:
		self.repo = repository or repo_module.CommunitiesRepository()

	async def escalate(
		self,
		user: AuthenticatedUser,
		group_id: UUID,
		payload: dto.EscalateRequest,
	) -> dto.AuditEventResponse:
		membership = await self.repo.get_member(group_id, UUID(user.id))
		policies.assert_can_moderate(membership.role if membership else None)
		details: dict[str, str] = {"reason": payload.reason}
		if payload.target_user_id:
			details["target_user_id"] = str(payload.target_user_id)
		event = await self.repo.record_audit_event(
			group_id=group_id,
			user_id=UUID(user.id),
			action="moderation.escalate",
			details=details,
		)
		return dto.AuditEventResponse(**event.model_dump())


__all__ = ["EscalationService"]
