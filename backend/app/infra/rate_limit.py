"""Simple Redis-backed rate limiting utilities."""

from __future__ import annotations

import time
import math
from typing import Optional

from app.infra.redis import redis_client


async def allow(
	kind: str,
	actor_id: str,
	*,
	limit: int,
	window_seconds: int = 60,
	now: Optional[float] = None,
) -> bool:
	"""Return True when the operation is still within the allowed budget."""

	if limit <= 0:
		return False
	now = now or time.time()
	window = max(1, int(window_seconds))
	slot = int(math.floor(now / window))
	key = f"rl:{kind}:{actor_id}:{slot}:{window}"
	async with redis_client.pipeline(transaction=True) as pipe:
		pipe.incr(key)
		pipe.expire(key, window_seconds)
		count, _ = await pipe.execute()
	return int(count) <= limit


class RateLimitExceeded(Exception):
	"""Raised when the rate limit has been hit."""

