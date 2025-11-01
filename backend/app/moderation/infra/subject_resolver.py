"""Resolve moderation subject ownership from communities domain."""

from __future__ import annotations

from typing import Optional
from uuid import UUID

from app.communities.domain import repo as communities_repo


class CommunitiesSubjectResolver:
    """Best-effort subject ownership resolver backed by communities repository."""

    def __init__(self, repository: communities_repo.CommunitiesRepository | None = None) -> None:
        self._repo = repository or communities_repo.CommunitiesRepository()

    async def resolve_owner(self, subject_type: str, subject_id: str) -> Optional[str]:
        parser = _PARSERS.get(subject_type)
        if parser is None:
            return None
        subject_uuid = parser(subject_id)
        if subject_uuid is None and subject_type != "user":
            return None
        if subject_type == "post":
            post = await self._repo.get_post(subject_uuid) if subject_uuid else None
            return str(post.author_id) if post else None
        if subject_type == "comment":
            comment = await self._repo.get_comment(subject_uuid) if subject_uuid else None
            return str(comment.author_id) if comment else None
        if subject_type == "group":
            group = await self._repo.get_group(subject_uuid) if subject_uuid else None
            return str(group.created_by) if group else None
        if subject_type == "event":
            event = await self._repo.get_event(subject_uuid) if subject_uuid else None
            return str(event.created_by) if event else None
        if subject_type == "user":
            return subject_id
        return None


def _parse_uuid(value: str) -> UUID | None:
    try:
        return UUID(str(value))
    except (ValueError, TypeError):
        return None


_PARSERS = {
    "post": _parse_uuid,
    "comment": _parse_uuid,
    "group": _parse_uuid,
    "event": _parse_uuid,
    "user": lambda value: None,
}
