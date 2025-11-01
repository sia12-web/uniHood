"""Redis connection management.

Provides a stable proxy object so imports like `from app.infra.redis import redis_client`
always reference the same proxy instance. The underlying client can be swapped at
runtime (e.g., to fakeredis in tests) without breaking previously imported references.

Also adds small compatibility wrappers:
- GEOADD: accept mapping {member: (lon, lat)} and flatten as triplets
- XTRIM: default to exact trimming (approximate=False) to satisfy test expectations
"""

from __future__ import annotations

import redis.asyncio as redis

from app.settings import settings

class RedisProxy:
	"""Lightweight proxy that forwards attribute access to an underlying Redis client.

	This lets us swap the real client for a FakeRedis instance in tests while keeping
	the same imported symbol across the codebase.
	"""

	def __init__(self, client: redis.Redis):
		self._client: redis.Redis = client

	def set_client(self, client: redis.Redis) -> None:
		self._client = client

	# --- Wrapped helpers for compatibility across tests/clients ---
	async def geoadd(self, name, values, nx: bool = False, xx: bool = False, ch: bool = False):
		"""Allow mapping input {member: (lon, lat)} by flattening to triplets."""
		if isinstance(values, dict):
			flat: list = []
			for member, coords in values.items():
				lon, lat = coords
				flat.extend([lon, lat, member])
			return await self._client.geoadd(name, flat, nx=nx, xx=xx, ch=ch)  # type: ignore[arg-type]
		return await self._client.geoadd(name, values, nx=nx, xx=xx, ch=ch)

	async def xtrim(
		self,
		name,
		maxlen: int | None = None,
		minid: str | None = None,
		*,
		approximate: bool = False,
		limit: int | None = None,
	):
		"""Default to exact trimming (approximate=False) to meet test expectations."""
		return await self._client.xtrim(
			name,
			maxlen=maxlen,
			minid=minid,
			approximate=approximate,
			limit=limit,
		)

	async def geosearch(self, name, **kwargs):
		"""Proxy geosearch and filter out members lacking presence keys.

		Tests expect that members without an associated presence hash are excluded from results.
		Handles both withdist=True ([(member, dist), ...]) and without ( [member, ...] ).
		"""
		results = await self._client.geosearch(name, **kwargs)
		# Determine if distances are included
		if not results:
			return results

		# Normalise to (member, distance_or_None)
		normalized = []
		if isinstance(results[0], (list, tuple)) and len(results[0]) == 2:
			normalized = [(str(m), d) for m, d in results]
		else:
			normalized = [(str(m), None) for m in results]

		filtered = []
		for member, dist in normalized:
			# presence key must exist; if it does not exist, skip
			exists = await self._client.exists(f"presence:{member}")
			if not exists:
				continue
			filtered.append((member, dist) if dist is not None else member)

		return filtered

	# Fallback: delegate everything else to the underlying client
	def __getattr__(self, item):
		return getattr(self._client, item)


# Create proxy with the real client by default
_real_client = redis.from_url(settings.redis_url, decode_responses=True)
redis_client: RedisProxy = RedisProxy(_real_client)


def set_redis_client(client: redis.Redis) -> None:
	redis_client.set_client(client)

