from __future__ import annotations

from typing import Iterable
from uuid import UUID

from app.infra.postgres import get_pool
from app.domain.common.campus_guard import require_same_campus
from app.domain.chat import models


async def list_by_room(room_id: UUID, *, campus_id: UUID, limit: int = 50, offset: int = 0) -> list[models.Message]:
    """Return latest messages for a room, bound to campus_id for safety.

    If the room's campus differs from the requester's campus, raise via
    `require_same_campus`.
    """
    pool = await get_pool()
    async with pool.acquire() as conn:
        room = await conn.fetchrow("SELECT id, campus_id FROM rooms WHERE id = $1", str(room_id))
        if not room:
            return []
        require_same_campus(str(campus_id), room.get("campus_id"))
        rows = await conn.fetch(
            "SELECT * FROM messages WHERE room_id = $1 AND campus_id = $2 AND deleted_at IS NULL ORDER BY created_at DESC LIMIT $3 OFFSET $4",
            str(room_id),
            str(campus_id),
            limit,
            offset,
        )
        return [models.Message.from_record(r) for r in rows]
