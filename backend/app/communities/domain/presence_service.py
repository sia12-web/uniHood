"""Presence tracking utilities for communities realtime layer."""

from __future__ import annotations

import time
from datetime import datetime, timezone
from typing import Iterable, Optional
from uuid import UUID

from app.communities.schemas import dto
from app.infra.auth import AuthenticatedUser
from app.infra.redis import redis_client
from app.obs import metrics as obs_metrics

_USER_KEY = "comm:presence:user:{user_id}"
_GROUP_KEY = "comm:presence:group:{group_id}"
_ONLINE_SET = "comm:presence:online"
_TTL_SECONDS = 90


class PresenceService:
	"""Handles presence heartbeats and lookups for communities namespaces."""

	def __init__(self, *, ttl_seconds: int = _TTL_SECONDS) -> None:
		self.ttl_seconds = ttl_seconds

	@staticmethod
	def _group_members_key(group_id: UUID) -> str:
		return _GROUP_KEY.format(group_id=group_id)

	@staticmethod
	def _user_key(user_id: UUID | str) -> str:
		return _USER_KEY.format(user_id=user_id)

	async def heartbeat(
		self,
		user: AuthenticatedUser,
		payload: dto.PresenceHeartbeatRequest,
	) -> dto.PresenceListResponse:
		now_ms = int(time.time() * 1000)
		user_uuid = UUID(user.id)
		serialized_groups = ",".join(str(group_id) for group_id in payload.group_ids)
		user_key = self._user_key(user_uuid)
		await redis_client.hset(user_key, mapping={"ts": str(now_ms), "groups": serialized_groups})
		await redis_client.expire(user_key, self.ttl_seconds)
		await redis_client.sadd(_ONLINE_SET, str(user_uuid))
		await redis_client.expire(_ONLINE_SET, self.ttl_seconds)
		for group_id in payload.group_ids:
			group_key = self._group_members_key(group_id)
			await redis_client.zadd(group_key, {str(user_uuid): now_ms})
			await redis_client.expire(group_key, self.ttl_seconds)
			await redis_client.zremrangebyscore(group_key, 0, now_ms - self.ttl_seconds * 1000)
		await redis_client.srem(_ONLINE_SET, "")
		total_online = await redis_client.scard(_ONLINE_SET)
		obs_metrics.comm_presence_online("total", int(total_online or 0))
		obs_metrics.inc_presence_heartbeat(user.campus_id)
		return await self.list_group_presence(user, payload.group_ids[0] if payload.group_ids else None)

	async def list_group_presence(
		self,
		user: AuthenticatedUser,
		group_id: Optional[UUID],
	) -> dto.PresenceListResponse:
		if group_id is None:
			return dto.PresenceListResponse(group_id=None, items=[])
		now_ms = int(time.time() * 1000)
		cutoff = now_ms - self.ttl_seconds * 1000
		group_key = self._group_members_key(group_id)
		members = await redis_client.zrangebyscore(group_key, cutoff, now_ms, withscores=True)
		items: list[dto.PresenceMemberStatus] = []
		for member_id, score in members:
			last_seen = datetime.fromtimestamp(score / 1000, tz=timezone.utc)
			items.append(
				dto.PresenceMemberStatus(
					user_id=UUID(str(member_id)),
					online=True,
					last_seen=last_seen,
				)
			)
		obs_metrics.comm_presence_online(f"group:{group_id}", len(items))
		return dto.PresenceListResponse(group_id=group_id, items=items)


async def prune_offline_groups(groups: Iterable[UUID]) -> None:
	"""Ensure group presence sorted sets stay within TTL."""
	now_ms = int(time.time() * 1000)
	cutoff = now_ms - _TTL_SECONDS * 1000
	for group_id in groups:
		group_key = _GROUP_KEY.format(group_id=group_id)
		await redis_client.zremrangebyscore(group_key, 0, cutoff)
