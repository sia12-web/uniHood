"""Staff-facing linkage inspection endpoints."""

from __future__ import annotations

from fastapi import APIRouter, Depends
from pydantic import BaseModel

from app.infra.auth import AuthenticatedUser, get_admin_user
from app.moderation.domain.container import get_linkage_service
from app.moderation.domain.linkage import LinkageRecord

router = APIRouter(prefix="/api/mod/v1/linkage", tags=["moderation-linkage"])


class LinkageRecordOut(BaseModel):
    cluster_id: str
    user_id: str
    relation: str
    strength: int
    created_at: str

    @classmethod
    def from_domain(cls, record: LinkageRecord) -> "LinkageRecordOut":
        return cls(
            cluster_id=record.cluster_id,
            user_id=record.user_id,
            relation=record.relation,
            strength=record.strength,
            created_at=record.created_at.isoformat(),
        )


@router.get("/{user_id}", response_model=list[LinkageRecordOut])
async def get_linkage(user_id: str, _: AuthenticatedUser = Depends(get_admin_user)) -> list[LinkageRecordOut]:
    service = get_linkage_service()
    records = await service.peers_for_user(user_id)
    return [LinkageRecordOut.from_domain(record) for record in records]
