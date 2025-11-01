"""Redis key helpers for communities realtime presence."""

from __future__ import annotations

from uuid import UUID

USER_KEY = "comm:presence:user:{user_id}"
GROUP_KEY = "comm:presence:group:{group_id}"
ONLINE_SET = "comm:presence:online"


def user_key(user_id: UUID | str) -> str:
	return USER_KEY.format(user_id=user_id)


def group_key(group_id: UUID | str) -> str:
	return GROUP_KEY.format(group_id=group_id)
