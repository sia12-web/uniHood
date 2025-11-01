"""REST surface for interests, skills, links, and education controls."""

from __future__ import annotations

from typing import List, Optional
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, status

from app.domain.identity import education, interests, links, policy, schemas, skills
from app.infra.auth import AuthenticatedUser, get_current_user
from app.obs import metrics as obs_metrics

router = APIRouter()


def _map_policy_error(exc: policy.IdentityPolicyError) -> HTTPException:
	obs_metrics.inc_identity_reject(exc.reason)
	if isinstance(exc, policy.IdentityRateLimitExceeded):
		return HTTPException(status.HTTP_429_TOO_MANY_REQUESTS, detail=exc.reason)
	if isinstance(exc, policy.HandleConflict):
		return HTTPException(status.HTTP_409_CONFLICT, detail=exc.reason)
	return HTTPException(status.HTTP_400_BAD_REQUEST, detail=exc.reason)


@router.get("/interests/taxonomy", response_model=List[schemas.InterestNode])
async def interests_taxonomy(
	limit: int = Query(default=200, ge=1, le=500),
	offset: int = Query(default=0, ge=0),
	parent_id: Optional[UUID] = Query(default=None),
) -> List[schemas.InterestNode]:
	return await interests.list_taxonomy(limit=limit, offset=offset, parent_id=parent_id)


@router.get("/interests/suggest", response_model=List[schemas.InterestNode])
async def interests_suggest(
	q: str = Query(min_length=2, max_length=50),
	campus_id: Optional[str] = Query(default=None),
	limit: int = Query(default=10, ge=1, le=25),
) -> List[schemas.InterestNode]:
	return await interests.suggest_interests(query=q, campus_id=campus_id, limit=limit)


@router.get("/interests/me", response_model=List[schemas.MyInterest])
async def my_interests(auth_user: AuthenticatedUser = Depends(get_current_user)) -> List[schemas.MyInterest]:
	return await interests.get_user_interests(auth_user.id)


@router.post("/interests/me", response_model=List[schemas.MyInterest])
async def add_interest(
	payload: schemas.InterestAddRequest,
	auth_user: AuthenticatedUser = Depends(get_current_user),
) -> List[schemas.MyInterest]:
	try:
		return await interests.add_user_interest(auth_user.id, payload.interest_id, payload.visibility)
	except policy.IdentityPolicyError as exc:
		raise _map_policy_error(exc) from None


@router.delete("/interests/me", response_model=List[schemas.MyInterest])
async def remove_interest(
	payload: schemas.InterestRemoveRequest,
	auth_user: AuthenticatedUser = Depends(get_current_user),
) -> List[schemas.MyInterest]:
	try:
		return await interests.remove_user_interest(auth_user.id, payload.interest_id)
	except policy.IdentityPolicyError as exc:
		raise _map_policy_error(exc) from None


@router.patch("/interests/me/visibility", response_model=List[schemas.MyInterest])
async def patch_interest_visibility(
	payload: schemas.InterestVisibilityPatch,
	auth_user: AuthenticatedUser = Depends(get_current_user),
) -> List[schemas.MyInterest]:
	try:
		return await interests.update_interest_visibility(auth_user.id, payload.interest_id, payload.visibility)
	except policy.IdentityPolicyError as exc:
		raise _map_policy_error(exc) from None


@router.get("/skills/me", response_model=List[schemas.MySkill])
async def my_skills(auth_user: AuthenticatedUser = Depends(get_current_user)) -> List[schemas.MySkill]:
	return await skills.list_user_skills(auth_user.id)


@router.post("/skills/me", response_model=List[schemas.MySkill])
async def upsert_skill_endpoint(
	payload: schemas.SkillUpsertRequest,
	auth_user: AuthenticatedUser = Depends(get_current_user),
) -> List[schemas.MySkill]:
	try:
		return await skills.upsert_skill(auth_user.id, payload)
	except policy.IdentityPolicyError as exc:
		raise _map_policy_error(exc) from None


@router.delete("/skills/me", response_model=List[schemas.MySkill])
async def remove_skill_endpoint(
	payload: schemas.SkillRemoveRequest,
	auth_user: AuthenticatedUser = Depends(get_current_user),
) -> List[schemas.MySkill]:
	try:
		return await skills.remove_skill(auth_user.id, payload.name)
	except policy.IdentityPolicyError as exc:
		raise _map_policy_error(exc) from None


@router.patch("/skills/me/visibility", response_model=List[schemas.MySkill])
async def patch_skill_visibility_endpoint(
	payload: schemas.SkillVisibilityPatch,
	auth_user: AuthenticatedUser = Depends(get_current_user),
) -> List[schemas.MySkill]:
	try:
		return await skills.update_skill_visibility(auth_user.id, payload.name, payload.visibility)
	except policy.IdentityPolicyError as exc:
		raise _map_policy_error(exc) from None


@router.get("/links/me", response_model=List[schemas.MyLink])
async def my_links(auth_user: AuthenticatedUser = Depends(get_current_user)) -> List[schemas.MyLink]:
	return await links.list_links(auth_user.id)


@router.post("/links/me", response_model=List[schemas.MyLink])
async def upsert_link_endpoint(
	payload: schemas.LinkUpsertRequest,
	auth_user: AuthenticatedUser = Depends(get_current_user),
) -> List[schemas.MyLink]:
	try:
		return await links.upsert_link(auth_user.id, payload)
	except policy.IdentityPolicyError as exc:
		raise _map_policy_error(exc) from None


@router.delete("/links/me", response_model=List[schemas.MyLink])
async def remove_link_endpoint(
	payload: schemas.LinkRemoveRequest,
	auth_user: AuthenticatedUser = Depends(get_current_user),
) -> List[schemas.MyLink]:
	try:
		return await links.remove_link(auth_user.id, payload.kind)
	except policy.IdentityPolicyError as exc:
		raise _map_policy_error(exc) from None


@router.patch("/links/me/visibility", response_model=List[schemas.MyLink])
async def patch_link_visibility_endpoint(
	payload: schemas.LinkVisibilityPatch,
	auth_user: AuthenticatedUser = Depends(get_current_user),
) -> List[schemas.MyLink]:
	try:
		return await links.update_link_visibility(auth_user.id, payload.kind, payload.visibility)
	except policy.IdentityPolicyError as exc:
		raise _map_policy_error(exc) from None


@router.get("/education/me", response_model=schemas.EducationOut)
async def my_education(auth_user: AuthenticatedUser = Depends(get_current_user)) -> schemas.EducationOut:
	return await education.get_education(auth_user.id)


@router.patch("/education/me", response_model=schemas.EducationOut)
async def patch_education_endpoint(
	payload: schemas.EducationPatch,
	auth_user: AuthenticatedUser = Depends(get_current_user),
) -> schemas.EducationOut:
	try:
		return await education.patch_education(auth_user.id, payload)
	except policy.IdentityPolicyError as exc:
		raise _map_policy_error(exc) from None
