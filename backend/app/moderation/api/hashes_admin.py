"""Administrative endpoints for perceptual hash imports."""

from __future__ import annotations

from typing import Iterable

from fastapi import APIRouter, Depends, status
from pydantic import BaseModel, Field

from app.moderation.domain.container import get_safety_repository
from app.moderation.domain.safety_repository import MediaHashUpsert, SafetyRepository

router = APIRouter(prefix="/api/mod/v1/hashes", tags=["moderation-hashes"])


class HashEntryIn(BaseModel):
    algo: str = Field(pattern=r"^(phash|pdq|ahash)$")
    hash: str = Field(min_length=8, max_length=128)
    label: str
    source: str


class HashImportRequest(BaseModel):
    entries: list[HashEntryIn]


class HashImportResponse(BaseModel):
    imported: int


def _repo_dep() -> SafetyRepository:
    return get_safety_repository()


@router.post("/import", status_code=status.HTTP_202_ACCEPTED, response_model=HashImportResponse)
async def import_hashes(payload: HashImportRequest, repository: SafetyRepository = Depends(_repo_dep)) -> HashImportResponse:
    upserts = _to_upserts(payload.entries)
    count = await repository.bulk_upsert_media_hashes(upserts)
    return HashImportResponse(imported=count)


def _to_upserts(entries: Iterable[HashEntryIn]) -> list[MediaHashUpsert]:
    return [MediaHashUpsert(algo=entry.algo, hash_value=entry.hash, label=entry.label, source=entry.source) for entry in entries]
