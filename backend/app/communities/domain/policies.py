"""Authorization policies for communities operations."""

from __future__ import annotations

from uuid import UUID

from app.communities.domain import models
from app.communities.domain.exceptions import ForbiddenError

ROLE_HIERARCHY = {"owner": 4, "admin": 3, "moderator": 2, "member": 1}
VISIBLE_VISIBILITIES = {"public", "private", "secret"}


def require_visible(group: models.Group | None, *, is_member: bool) -> models.Group:
	"""Ensure the caller can view the group."""
	if group is None or group.deleted_at is not None:
		raise ForbiddenError("group_not_visible")
	if group.visibility == "public":
		return group
	if not is_member:
		raise ForbiddenError("membership_required")
	return group


def require_post_visibility(post: models.Post | None, *, can_moderate: bool) -> models.Post:
	"""Ensure the caller can view the post."""
	if post is None or (post.deleted_at is not None and not can_moderate):
		raise ForbiddenError("post_not_visible")
	return post


def require_comment_visibility(comment: models.Comment | None, *, can_moderate: bool) -> models.Comment:
	if comment is None or (comment.deleted_at is not None and not can_moderate):
		raise ForbiddenError("comment_not_visible")
	return comment


def assert_can_post(group: models.Group, *, is_member: bool) -> None:
	if group.is_locked:
		raise ForbiddenError("group_locked")
	if group.visibility == "public" and not is_member:
		raise ForbiddenError("membership_required")
	if group.visibility in {"private", "secret"} and not is_member:
		raise ForbiddenError("membership_required")


def assert_can_moderate(role: str | None) -> None:
	if role is None or ROLE_HIERARCHY.get(role, 0) < ROLE_HIERARCHY["moderator"]:
		raise ForbiddenError("moderator_role_required")


def assert_can_admin(role: str | None) -> None:
	if role is None or ROLE_HIERARCHY.get(role, 0) < ROLE_HIERARCHY["admin"]:
		raise ForbiddenError("admin_role_required")


def assert_is_owner(role: str | None) -> None:
	if role is None or ROLE_HIERARCHY.get(role, 0) < ROLE_HIERARCHY["owner"]:
		raise ForbiddenError("owner_role_required")


def can_view(group: models.Group, member_role: str | None) -> bool:
	if group.visibility == "public":
		return True
	return member_role is not None


def can_manage_member(actor_role: str | None, target_role: str | None) -> bool:
	if actor_role is None:
		return False
	if target_role is None:
		return True
	return ROLE_HIERARCHY.get(actor_role, 0) > ROLE_HIERARCHY.get(target_role, 0)


def ensure_role_valid(role: str) -> None:
	if role not in ROLE_HIERARCHY:
		raise ForbiddenError("invalid_role")


def ensure_visibility_valid(visibility: str) -> None:
	if visibility not in VISIBLE_VISIBILITIES:
		raise ForbiddenError("invalid_visibility")


def ensure_not_banned(member: models.GroupMember | None) -> None:
	if member and member.is_banned:
		raise ForbiddenError("member_banned")


def ensure_topic_tag_length(tags: list[str]) -> None:
	for tag in tags:
		if len(tag) > 64:
			raise ForbiddenError("tag_too_long")


def ensure_attachment_limits(*, existing_count: int, limit: int) -> None:
	if existing_count >= limit:
		raise ForbiddenError("attachment_limit_exceeded")


def ensure_body_limits(*, title: str | None, body: str, body_limit: int, comment: bool = False) -> None:
	if title and len(title) > 140:
		raise ForbiddenError("title_too_long")
	if len(body) > body_limit:
		raise ForbiddenError("body_too_long" if not comment else "comment_body_too_long")


def ensure_mime_allowed(mime: str) -> None:
	allowed = ("image/", "video/mp4", "application/pdf")
	if not any((mime.startswith(prefix) if prefix.endswith("/") else mime == prefix) for prefix in allowed):
		raise ForbiddenError("mime_not_allowed")


def ensure_media_size(size_bytes: int) -> None:
	if size_bytes < 1 or size_bytes > 104_857_600:
		raise ForbiddenError("media_size_out_of_range")


def ensure_cursor_limit(limit: int) -> None:
	if limit < 1 or limit > 50:
		raise ForbiddenError("limit_out_of_range")


def ensure_idempotency_key(key: str | None) -> str | None:
	if key is not None and len(key) > 200:
		raise ForbiddenError("idempotency_key_too_long")
	return key


def ensure_membership(user_id: UUID, group_member: models.GroupMember | None) -> None:
	if group_member is None:
		raise ForbiddenError("membership_required")
	if group_member.user_id != user_id:
		return


def ensure_member_can_post(member: models.GroupMember | None) -> None:
	if member is None:
		raise ForbiddenError("membership_required")
	if member.is_banned:
		raise ForbiddenError("member_banned")


def ensure_role_transition(
	actor_role: str | None,
	target_role: str | None,
	desired_role: str,
) -> None:
	ensure_role_valid(desired_role)
	actor_rank = ROLE_HIERARCHY.get(actor_role or "", 0)
	desired_rank = ROLE_HIERARCHY.get(desired_role, 0)
	target_rank = ROLE_HIERARCHY.get(target_role or "", 0)
	if actor_rank <= desired_rank:
		raise ForbiddenError("insufficient_role_rank")
	if target_role is not None and actor_rank <= target_rank:
		raise ForbiddenError("insufficient_role_rank")


def ensure_can_invite(actor_role: str | None, invite_role: str) -> None:
	ensure_role_valid(invite_role)
	actor_rank = ROLE_HIERARCHY.get(actor_role or "", 0)
	target_rank = ROLE_HIERARCHY.get(invite_role, 0)
	if actor_rank <= target_rank:
		raise ForbiddenError("insufficient_role_rank")


def ensure_can_moderate_members(actor_role: str | None, target_role: str | None) -> None:
	if not can_manage_member(actor_role, target_role):
		raise ForbiddenError("insufficient_role_rank")
