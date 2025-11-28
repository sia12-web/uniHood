"""Group endpoints for Communities Phase 1."""

from fastapi import APIRouter, Depends, HTTPException, status
from uuid import UUID

from app.communities.domain import services
from app.communities.schemas import dto
from app.communities.domain.policies import ensure_group_visibility
from app.communities.domain.repo import CommunitiesRepository
from app.communities.infra.idempotency import IdempotencyGuard
from app.communities.domain.models import CurrentUser

router = APIRouter(prefix="/groups", tags=["groups"])


def get_repo() -> CommunitiesRepository:
    return CommunitiesRepository()


def get_idempotency_guard() -> IdempotencyGuard:
    return IdempotencyGuard()


@router.post("", response_model=dto.Group, status_code=status.HTTP_201_CREATED)
async def create_group(
    body: dto.GroupCreate,
    current_user: CurrentUser = Depends(CurrentUser.depends),
    repo: CommunitiesRepository = Depends(get_repo),
    guard: IdempotencyGuard = Depends(get_idempotency_guard),
):
    async with guard.scope("create-group", body):
        group = await services.create_group(repo, current_user, body)
        return dto.Group.from_model(group)


@router.get("/{group_id}", response_model=dto.Group)
async def get_group(
    group_id: UUID,
    current_user: CurrentUser = Depends(CurrentUser.depends_optional),
    repo: CommunitiesRepository = Depends(get_repo),
):
    group = await repo.fetch_group(group_id)
    if not group:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND)
    ensure_group_visibility(current_user, group)
    return dto.Group.from_model(group, viewer=current_user)
