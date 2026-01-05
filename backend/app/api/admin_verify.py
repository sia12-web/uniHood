"""Admin moderation endpoints for verification review queue."""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Query, Request, status

from app.domain.identity import policy, schemas, verification
from app.infra.auth import AuthenticatedUser
from app.api.security_deps import require_roles
from app.obs import audit as obs_audit
from app.obs import metrics as obs_metrics

router = APIRouter()


import sys

def _inc_reject(reason: str) -> None:
	try:
		getattr(obs_metrics, "inc_identity_reject", lambda x: None)(reason)
	except Exception:
		pass

def _map_policy_error(exc: policy.IdentityPolicyError) -> HTTPException:
	_inc_reject(exc.reason)
	if exc.reason == "verification_not_found":
		return HTTPException(status.HTTP_404_NOT_FOUND, detail=exc.reason)
	if exc.reason in {"verification_locked", "verification_decided"}:
		return HTTPException(status.HTTP_409_CONFLICT, detail=exc.reason)
	if isinstance(exc, policy.IdentityRateLimitExceeded):
		return HTTPException(status.HTTP_429_TOO_MANY_REQUESTS, detail=exc.reason)
	return HTTPException(status.HTTP_400_BAD_REQUEST, detail=exc.reason)


@router.get("/admin/verify/queue", response_model=list[schemas.VerificationEntry])
async def list_review_queue(
	state: str = Query(default="pending"),
	limit: int = Query(default=50, ge=1, le=200),
	admin: AuthenticatedUser = Depends(require_roles("admin")),
) -> list[schemas.VerificationEntry]:
	# Access check performed via dependency; admin context unused otherwise.
	_ = admin
	try:
		return await verification.list_review_queue(state=state, limit=limit)
	except policy.IdentityPolicyError as exc:  # pragma: no cover - mapping ensures HTTP error
		raise _map_policy_error(exc) from None


@router.post("/admin/verify/{verification_id}/decide", response_model=schemas.VerificationEntry)
async def decide_review(
	verification_id: str,
	decision: schemas.AdminVerificationDecision,
	request: Request,
	admin: AuthenticatedUser = Depends(require_roles("admin")),
) -> schemas.VerificationEntry:
	try:
		result = await verification.decide_review(admin, verification_id, decision)
		await obs_audit.log_signed_intent_event(
			request,
			admin,
			"admin_verify.decide",
			extra={
				"verification_id": verification_id,
				"approve": decision.approve,
			},
		)
		return result
	except policy.IdentityPolicyError as exc:  # pragma: no cover - mapping ensures HTTP error
		raise _map_policy_error(exc) from None
