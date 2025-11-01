"""Audit log queries for communities moderation."""

from __future__ import annotations

from uuid import UUID

from app.communities.domain import policies, repo as repo_module
from app.communities.schemas import dto
from app.infra.auth import AuthenticatedUser


class AuditService:
	"""Provides access to sensitive audit trail entries."""

	def __init__(self, *, repository: repo_module.CommunitiesRepository | None = None) -> None:
		self.repo = repository or repo_module.CommunitiesRepository()

	async def list_events(
		self,
		user: AuthenticatedUser,
		group_id: UUID,
		*,
		limit: int = 50,
	) -> list[dto.AuditEventResponse]:
		membership = await self.repo.get_member(group_id, UUID(user.id))
		policies.assert_can_moderate(membership.role if membership else None)
		entries = await self.repo.list_audit_events(group_id, limit=limit)
		return [dto.AuditEventResponse(**entry.model_dump()) for entry in entries]


__all__ = ["AuditService"]
