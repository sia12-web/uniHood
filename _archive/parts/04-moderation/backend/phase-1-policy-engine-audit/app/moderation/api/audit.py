"""Audit log listing endpoint."""

from __future__ import annotations

from datetime import datetime

from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel

from app.moderation.domain.container import get_enforcer
from app.moderation.domain.enforcement import AuditLogEntry, ModerationEnforcer

router = APIRouter(prefix="/api/mod/v1/audit", tags=["moderation-audit"])


class AuditEntryOut(BaseModel):
    actor_id: str | None
    action: str
    target_type: str
    target_id: str
    meta: dict[str, object]
    created_at: datetime

    @classmethod
    def from_model(cls, entry: AuditLogEntry) -> "AuditEntryOut":
        return cls(
            actor_id=entry.actor_id,
            action=entry.action,
            target_type=entry.target_type,
            target_id=entry.target_id,
            meta=dict(entry.meta),
            created_at=entry.created_at,
        )


def get_enforcer_dep() -> ModerationEnforcer:
    return get_enforcer()


@router.get("", response_model=list[AuditEntryOut])
async def list_audit(
    after: datetime | None = Query(default=None),
    limit: int = Query(default=50, ge=1, le=100),
    enforcer: ModerationEnforcer = Depends(get_enforcer_dep),
) -> list[AuditEntryOut]:
    entries = await enforcer.repository.list_audit(after=after, limit=limit)
    return [AuditEntryOut.from_model(entry) for entry in entries]
