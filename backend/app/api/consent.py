"""Consent API endpoints for policy retrieval and acceptance."""

from __future__ import annotations

from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query

from app.domain.identity import consent, policy, schemas
from app.infra.auth import AuthenticatedUser, get_current_user

router = APIRouter(prefix="/consent", tags=["consent"])


def _map_error(exc: policy.IdentityPolicyError) -> HTTPException:
	reason = getattr(exc, "reason", "invalid")
	if isinstance(exc, policy.IdentityRateLimitExceeded):
		return HTTPException(status.HTTP_429_TOO_MANY_REQUESTS, detail=reason)
	if reason == "policy_not_found":
		return HTTPException(status.HTTP_404_NOT_FOUND, detail=reason)
	return HTTPException(status.HTTP_400_BAD_REQUEST, detail=reason)


@router.get("/policies", response_model=list[schemas.PolicyDocumentOut])
async def list_policies_endpoint() -> list[schemas.PolicyDocumentOut]:
	return await consent.list_policies()


@router.get("/policies/{slug}", response_model=schemas.PolicyDocumentOut)
async def get_policy_endpoint(slug: str, version: Optional[str] = Query(default=None)) -> schemas.PolicyDocumentOut:
	try:
		return await consent.get_policy(slug, version=version)
	except policy.IdentityPolicyError as exc:
		raise _map_error(exc) from exc


@router.get("/me", response_model=list[schemas.ConsentRecordOut])
async def my_consents(user: AuthenticatedUser = Depends(get_current_user)) -> list[schemas.ConsentRecordOut]:
	return await consent.list_user_consents(user.id)


@router.post("/me", response_model=list[schemas.ConsentRecordOut])
async def accept_consent_endpoint(
	payload: schemas.ConsentAcceptRequest,
	user: AuthenticatedUser = Depends(get_current_user),
) -> list[schemas.ConsentRecordOut]:
	try:
		return await consent.accept_consent(user.id, payload)
	except policy.IdentityPolicyError as exc:
		raise _map_error(exc) from exc


@router.get("/gate", response_model=schemas.ConsentGateResponse)
async def consent_gate_endpoint(user: AuthenticatedUser = Depends(get_current_user)) -> schemas.ConsentGateResponse:
	return await consent.consent_gate(user.id)
