"""Worker that fans out appeal submissions to staff notifications."""

from __future__ import annotations

import logging
from dataclasses import dataclass
from typing import Any, Iterable, Mapping, Protocol, Sequence
from uuid import UUID

from app.obs import metrics as obs_metrics

logger = logging.getLogger(__name__)


class RedisStream(Protocol):
    async def xread(
        self,
        streams: Mapping[str, str],
        count: int,
        block: int,
    ) -> list[tuple[str, list[tuple[str, Mapping[bytes, bytes]]]]]:
        ...


class NotificationService(Protocol):
    async def persist_notification(
        self,
        *,
        user_id: UUID,
        type: str,
        ref_id: UUID,
        actor_id: UUID,
        payload: Mapping[str, Any],
        max_per_second: int = 5,
    ) -> tuple[Any | None, bool]:
        ...


@dataclass
class AppealsWorker:
    """Consumes appeal stream events and notifies staff recipients."""

    redis: RedisStream
    notifications: NotificationService
    staff_recipient_ids: Sequence[str]
    stream_key: str = "mod:appeals"
    batch_size: int = 100
    block_ms: int = 5000
    last_id: str = "0-0"

    async def run_once(self) -> None:
        messages = await self.redis.xread({self.stream_key: self.last_id}, count=self.batch_size, block=self.block_ms)
        if not messages:
            return
        for _stream, entries in messages:
            for entry_id, payload in entries:
                event = _decode(payload)
                await self._handle_event(event)
            self.last_id = entries[-1][0]

    async def _handle_event(self, event: Mapping[str, Any]) -> None:
        case_id = _safe_uuid(event.get("case_id"))
        appeal_id = _safe_uuid(event.get("appeal_id"))
        actor_id = _safe_uuid(event.get("appellant_id")) or UUID(int=0)
        if not case_id or not appeal_id:
            logger.debug("skipping appeal event with missing IDs", extra={"event": event})
            return
        for recipient in self._iter_staff_recipients():
            try:
                await self.notifications.persist_notification(
                    user_id=recipient,
                    type="moderation.appeal.submitted",
                    ref_id=case_id,
                    actor_id=actor_id,
                    payload={
                        "case_id": str(case_id),
                        "appeal_id": str(appeal_id),
                    },
                )
            except Exception:  # noqa: BLE001 - do not halt on downstream failure
                logger.exception(
                    "failed to persist appeal notification",
                    extra={"recipient": str(recipient), "case_id": str(case_id)},
                )
    obs_metrics.MOD_APPEALS_TOTAL.labels(stage="fanout", outcome="pending").inc()

    def _iter_staff_recipients(self) -> Iterable[UUID]:
        for raw in self.staff_recipient_ids:
            staff_uuid = _safe_uuid(raw)
            if staff_uuid:
                yield staff_uuid


def _decode(payload: Mapping[bytes, bytes]) -> Mapping[str, Any]:
    result: dict[str, Any] = {}
    for key, value in payload.items():
        decoded_key = key.decode("utf-8") if isinstance(key, (bytes, bytearray)) else str(key)
        decoded_value: Any
        if isinstance(value, (bytes, bytearray)):
            decoded_value = value.decode("utf-8")
        else:
            decoded_value = value
        result[decoded_key] = decoded_value
    return result


def _safe_uuid(value: Any) -> UUID | None:
    if value is None:
        return None
    try:
        return UUID(str(value))
    except (ValueError, TypeError, AttributeError):
        return None
