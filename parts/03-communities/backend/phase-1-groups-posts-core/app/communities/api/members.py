"""Group membership endpoints."""

from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status

from app.communities.domain import services
from app.communities.schemas import dto
from app.communities.domain.repo import CommunitiesRepository
from app.communities.domain.models import CurrentUser

router = APIRouter(prefix="/groups/{group_id}/members", tags=["group-members"])


def get_repo() -> CommunitiesRepository:
    return CommunitiesRepository()


@router.post("", response_model=dto.GroupMember, status_code=status.HTTP_201_CREATED)
async def join_group(
    group_id: UUID,
    current_user: CurrentUser = Depends(CurrentUser.depends),
    repo: CommunitiesRepository = Depends(get_repo),
):
    member = await services.join_group(repo, current_user, group_id)
    if not member:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN)
    return dto.GroupMember.from_model(member)


@router.patch("/{user_id}", response_model=dto.GroupMember)
async def update_member(
    group_id: UUID,
    user_id: UUID,
    body: dto.GroupMemberUpdate,
    current_user: CurrentUser = Depends(CurrentUser.depends),
    repo: CommunitiesRepository = Depends(get_repo),
):
    member = await services.update_member_role(repo, current_user, group_id, user_id, body)
    if not member:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND)
    return dto.GroupMember.from_model(member)


@router.delete("/{user_id}", status_code=status.HTTP_204_NO_CONTENT)
async def remove_member(
    group_id: UUID,
    user_id: UUID,
    current_user: CurrentUser = Depends(CurrentUser.depends),
    repo: CommunitiesRepository = Depends(get_repo),
):
    await services.remove_member(repo, current_user, group_id, user_id)
