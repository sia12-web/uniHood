"""Actions worker applies moderation decisions emitted by the ingress worker."""

from __future__ import annotations

import json
from dataclasses import dataclass
from typing import Any, Mapping, Protocol

from app.moderation.domain.enforcement import ModerationEnforcer


class RedisStream(Protocol):
    async def xread(self, streams: Mapping[str, str], count: int, block: int) -> list[tuple[str, list[tuple[str, Mapping[bytes, bytes]]]]]:
        ...

    async def xadd(self, stream: str, fields: Mapping[str, Any]) -> str:
        ...


@dataclass
class ActionsWorker:
    """Consumes decisions and ensures idempotent enforcement."""

    redis: RedisStream
    enforcer: ModerationEnforcer
    stream_key: str = "mod:decisions"
    dlq_stream: str = "mod:actions_dlq"
    batch_size: int = 100
    block_ms: int = 5000
    last_id: str = "0-0"

    async def run_once(self) -> None:
        messages = await self.redis.xread({self.stream_key: self.last_id}, count=self.batch_size, block=self.block_ms)
        if not messages:
            return
        for _stream, entries in messages:
            for entry_id, payload in entries:
                body = _decode(payload)
                try:
                    await self._handle_decision(body)
                except Exception as exc:  # noqa: BLE001 - worker must DLQ unexpected failures
                    await self._dlq(entry_id, body, exc)
            self.last_id = entries[-1][0]

    async def _handle_decision(self, payload: Mapping[str, Any]) -> None:
        await self.enforcer.repository.audit(
            actor_id=None,
            action="decision.consume",
            target_type=str(payload.get("subject_type", "unknown")),
            target_id=str(payload.get("subject_id", "unknown")),
            meta=payload,
        )

    async def _dlq(self, entry_id: str, payload: Mapping[str, Any], exc: Exception) -> None:
        body = {
            "entry_id": entry_id,
            "payload": json.dumps(payload),
            "error": str(exc),
        }
        await self.redis.xadd(self.dlq_stream, body)


def _decode(payload: Mapping[Any, Any]) -> Mapping[str, Any]:
    decoded: dict[str, Any] = {}

    def _to_str(value: Any) -> str:
        return value if isinstance(value, str) else value.decode("utf-8")

    for key, value in payload.items():
        decoded[_to_str(key)] = _to_str(value)
    decoded["reasons"] = json.loads(decoded.get("reasons", "[]"))
    return decoded
