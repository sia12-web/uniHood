"""Feature flag CRUD, overrides, and evaluation endpoints."""

from __future__ import annotations

from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query, Request, status

from app.domain.identity import flags, policy, schemas
from app.api.security_deps import require_perms
from app.infra.auth import AuthenticatedUser, get_current_user
from app.obs import audit as obs_audit

router = APIRouter(prefix="/flags", tags=["flags"])

PERMISSION_FLAGS_MANAGE = "identity.flags.manage"


def _map_error(exc: policy.IdentityPolicyError) -> HTTPException:
	reason = getattr(exc, "reason", "invalid")
	if isinstance(exc, policy.IdentityRateLimitExceeded):
		return HTTPException(status.HTTP_429_TOO_MANY_REQUESTS, detail=reason)
	if reason in {"flag_not_found"}:
		return HTTPException(status.HTTP_404_NOT_FOUND, detail=reason)
	return HTTPException(status.HTTP_400_BAD_REQUEST, detail=reason)


@router.get("", response_model=list[schemas.FeatureFlagOut])
async def list_flags_endpoint(
	_: AuthenticatedUser = Depends(require_perms(PERMISSION_FLAGS_MANAGE)),
) -> list[schemas.FeatureFlagOut]:
	return await flags.list_flags()


@router.post("", response_model=schemas.FeatureFlagOut, status_code=status.HTTP_201_CREATED)
async def upsert_flag_endpoint(
	request: Request,
	payload: schemas.FeatureFlagUpsertRequest,
	actor: AuthenticatedUser = Depends(require_perms(PERMISSION_FLAGS_MANAGE)),
) -> schemas.FeatureFlagOut:
	try:
		result = await flags.upsert_flag(actor.id, payload)
		await obs_audit.log_signed_intent_event(
			request,
			actor,
			"flags.upsert",
			extra={"flag_key": result.key},
		)
		return result
	except policy.IdentityPolicyError as exc:
		raise _map_error(exc) from exc


@router.delete("/{key}", status_code=status.HTTP_200_OK)
async def delete_flag_endpoint(
	request: Request,
	key: str,
	actor: AuthenticatedUser = Depends(require_perms(PERMISSION_FLAGS_MANAGE)),
) -> dict[str, str]:
	try:
		await flags.delete_flag(actor.id, key)
	except policy.IdentityPolicyError as exc:
		raise _map_error(exc) from exc
	await obs_audit.log_signed_intent_event(
		request,
		actor,
		"flags.delete",
		extra={"flag_key": key},
	)
	return {"status": "ok"}


@router.get("/{key}/overrides", response_model=list[schemas.FlagOverrideOut])
async def list_overrides_endpoint(
	key: str,
	user_id: Optional[str] = Query(default=None),
	campus_id: Optional[str] = Query(default=None),
	_: AuthenticatedUser = Depends(require_perms(PERMISSION_FLAGS_MANAGE)),
) -> list[schemas.FlagOverrideOut]:
	return await flags.list_overrides(key, user_id=user_id, campus_id=campus_id)


@router.post("/overrides", response_model=schemas.FlagOverrideOut)
async def upsert_override_endpoint(
	request: Request,
	payload: schemas.FlagOverrideRequest,
	actor: AuthenticatedUser = Depends(require_perms(PERMISSION_FLAGS_MANAGE)),
) -> schemas.FlagOverrideOut:
	try:
		result = await flags.upsert_override(actor.id, payload)
		await obs_audit.log_signed_intent_event(
			request,
			actor,
			"flags.override_upsert",
			extra={"flag_key": payload.flag_key, "target_user_id": payload.user_id, "target_campus_id": payload.campus_id},
		)
		return result
	except policy.IdentityPolicyError as exc:
		raise _map_error(exc) from exc


@router.delete("/overrides", status_code=status.HTTP_200_OK)
async def delete_override_endpoint(
	request: Request,
	payload: schemas.FlagOverrideDeleteRequest,
	actor: AuthenticatedUser = Depends(require_perms(PERMISSION_FLAGS_MANAGE)),
) -> dict[str, str]:
	try:
		await flags.delete_override(actor.id, payload)
	except policy.IdentityPolicyError as exc:
		raise _map_error(exc) from exc
	await obs_audit.log_signed_intent_event(
		request,
		actor,
		"flags.override_delete",
		extra={"flag_key": payload.flag_key, "target_user_id": payload.user_id, "target_campus_id": payload.campus_id},
	)
	return {"status": "ok"}


@router.get("/{key}/evaluate", response_model=schemas.FlagEvaluationResult)
async def evaluate_flag_endpoint(
	key: str,
	user: AuthenticatedUser = Depends(get_current_user),
	campus_id: Optional[str] = Query(default=None),
) -> schemas.FlagEvaluationResult:
	return await flags.evaluate_flag(
		key,
		user_id=user.id,
		campus_id=campus_id or user.campus_id,
		traits={"handle": user.handle} if user.handle else None,
	)


@router.get("/evaluate", response_model=dict[str, bool])
async def evaluate_all_flags_endpoint(
	user: AuthenticatedUser = Depends(get_current_user),
) -> dict[str, bool]:
	all_flags = await flags.list_flags()
	result = {}
	for flag in all_flags:
		eval_result = await flags.evaluate_flag(
			flag.key,
			user_id=user.id,
			campus_id=user.campus_id,
			traits={"handle": user.handle} if user.handle else None,
		)
		result[flag.key] = eval_result.enabled
	return result
