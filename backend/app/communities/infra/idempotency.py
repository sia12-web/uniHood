"""Idempotency helpers backed by Redis."""

from __future__ import annotations

import json
import logging
from dataclasses import dataclass
from hashlib import sha256
from typing import Any, Awaitable, Callable, TypeVar

from app.communities.domain.exceptions import IdempotencyConflict
from app.infra.redis import redis_client

_LOG = logging.getLogger(__name__)

T = TypeVar("T")
_DEFAULT_TTL_SECONDS = 24 * 60 * 60


@dataclass(slots=True)
class IdempotencyRecord:
	"""Serialized value stored in Redis."""

	hash: str
	payload: Any

	def to_json(self) -> str:
		return json.dumps({"hash": self.hash, "payload": self.payload})

	@staticmethod
	def from_json(raw: str) -> "IdempotencyRecord":
		data = json.loads(raw)
		return IdempotencyRecord(hash=data.get("hash", ""), payload=data.get("payload"))


def compute_hash(*, body: Any | None) -> str:
	"""Return a stable hash of the request body used for conflict detection."""
	if body is None:
		return ""
	materialised = json.dumps(body, sort_keys=True, separators=(",", ":"))
	return sha256(materialised.encode()).hexdigest()


async def resolve(
	*,
	key: str | None,
	body_hash: str,
	producer: Callable[[], Awaitable[T]],
	serializer: Callable[[T], Any],
	deserializer: Callable[[Any], T] | None = None,
) -> T:
	"""Resolve an idempotent operation with the provided producer.

	If the key already exists and matches the incoming hash, return the cached payload.
	If the stored hash differs, raise :class:`IdempotencyConflict`.
	Otherwise compute, persist, and return the new payload.
	"""
	if not key:
		result = await producer()
		return result

	redis_key = f"communities:idemp:{key}"
	cached = await redis_client.get(redis_key)
	if cached:
		record = IdempotencyRecord.from_json(cached)
		if record.hash != body_hash:
			raise IdempotencyConflict()
		if deserializer:
			return deserializer(record.payload)
		return record.payload  # type: ignore[return-value]

	result = await producer()
	payload = serializer(result)
	record = IdempotencyRecord(hash=body_hash, payload=payload)
	stored = await redis_client.set(redis_key, record.to_json(), ex=_DEFAULT_TTL_SECONDS, nx=True)
	if not stored:
		# Another request stored a value after our check; fetch again to confirm.
		cached_after = await redis_client.get(redis_key)
		if cached_after:
			record_after = IdempotencyRecord.from_json(cached_after)
			if record_after.hash != body_hash:
				raise IdempotencyConflict()
			if deserializer:
				return deserializer(record_after.payload)
			return record_after.payload  # type: ignore[return-value]
		_LOG.warning("Idempotency key %s stored concurrently without payload", key)
	return result
