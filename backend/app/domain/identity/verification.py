"""Service helpers orchestrating SSO and document verification flows."""

from __future__ import annotations

import json
from datetime import datetime, timedelta, timezone
from typing import Optional
from uuid import uuid4

from app.domain.identity import oauth, policy, review, schemas, s3_verify, trust
from app.infra.auth import AuthenticatedUser
from app.infra.postgres import get_pool
from app.infra.redis import redis_client
from app.obs import metrics as obs_metrics

DOC_UPLOAD_KEY = "verify:doc:upload:{user_id}"


def _utcnow() -> datetime:
	return datetime.now(timezone.utc)


def _doc_upload_key(user_id: str) -> str:
	return DOC_UPLOAD_KEY.format(user_id=user_id)


def _row_to_entry(row) -> schemas.VerificationEntry:
	return schemas.VerificationEntry(
		id=row["id"],
		user_id=row["user_id"],
		method=row["method"],
		state=row["state"],
		evidence=dict(row.get("evidence") or {}),
		reason=row.get("reason"),
		expires_at=row.get("expires_at"),
		created_at=row["created_at"],
		decided_at=row.get("decided_at"),
	)


async def get_status(user: AuthenticatedUser) -> schemas.VerificationStatusResponse:
	pool = await get_pool()
	async with pool.acquire() as conn:
		trust_row = await conn.fetchrow(
			"""
			SELECT trust_level, badge, verified_at, expires_at
			FROM trust_profiles
			WHERE user_id = $1
			""",
			user.id,
		)
		verification_rows = await conn.fetch(
			"""
			SELECT id, user_id, method, state, evidence, reason, expires_at, created_at, decided_at
			FROM verifications
			WHERE user_id = $1
			ORDER BY created_at DESC
			""",
			user.id,
		)

	trust_out = schemas.TrustProfileOut(
		trust_level=int(trust_row["trust_level"]) if trust_row else 0,
		badge=trust_row.get("badge") if trust_row else None,
		verified_at=trust_row.get("verified_at") if trust_row else None,
		expires_at=trust_row.get("expires_at") if trust_row else None,
	)
	verifications = [_row_to_entry(row) for row in verification_rows]
	return schemas.VerificationStatusResponse(trust=trust_out, verifications=verifications)


async def start_sso(user: AuthenticatedUser, provider: str, *, redirect_uri: Optional[str] = None) -> oauth.OAuthStartPayload:
	payload = await oauth.start(provider, user, redirect_uri=redirect_uri)
	obs_metrics.inc_verify_sso_attempt(provider, "started")
	return payload


async def complete_sso(provider: str, state: str, id_token: str) -> schemas.VerificationEntry:
	result = await oauth.complete(provider, state, id_token)
	if not result.email_verified:
		obs_metrics.inc_verify_sso_attempt(provider, "email_unverified")
		raise policy.IdentityPolicyError("verify_email_unverified")

	pool = await get_pool()
	async with pool.acquire() as conn:
		async with conn.transaction():
			campus_row = await conn.fetchrow(
				"""
				SELECT c.domain
				FROM users u
				LEFT JOIN campuses c ON u.campus_id = c.id
				WHERE u.id = $1
				""",
				result.user_id,
			)
			campus_domain = campus_row.get("domain") if campus_row else None
			if campus_domain and not result.email.endswith(f"@{campus_domain.lower()}"):
				obs_metrics.inc_verify_sso_attempt(provider, "domain_mismatch")
				raise policy.IdentityPolicyError("verify_domain_mismatch")

			verification_id = uuid4()
			now = _utcnow()
			expires_at = now + timedelta(days=365)
			evidence = {"provider": result.provider, "email": result.email}
			await conn.execute(
				"""
				INSERT INTO verifications (id, user_id, method, state, evidence, reason, expires_at, created_at, decided_at)
				VALUES ($1, $2, 'sso', 'approved', $3, NULL, $4, $5, $5)
				""",
				verification_id,
				result.user_id,
				evidence,
				expires_at,
				now,
			)
			row = await conn.fetchrow(
				"""
				SELECT id, user_id, method, state, evidence, reason, expires_at, created_at, decided_at
				FROM verifications
				WHERE id = $1
				""",
				verification_id,
			)

	obs_metrics.inc_verify_sso_attempt(provider, "approved")
	await trust.recompute_trust(result.user_id)
	return _row_to_entry(row)


async def presign_document(user: AuthenticatedUser, payload: schemas.VerificationDocPresignRequest) -> schemas.PresignResponse:
	await policy.enforce_verify_doc_rate(user.id)
	presign = s3_verify.presign_document(user.id, payload)
	await redis_client.set(
		_doc_upload_key(user.id),
		json.dumps({"key": presign.key, "mime": payload.mime}),
		ex=policy.DOC_UPLOAD_TTL_SECONDS,
	)
	return presign


async def submit_document(user: AuthenticatedUser, submission: schemas.VerificationDocSubmit) -> schemas.VerificationEntry:
	await policy.enforce_verify_doc_rate(user.id)
	cached = await redis_client.get(_doc_upload_key(user.id))
	if cached:
		meta = json.loads(cached)
		if submission.key != meta.get("key"):
			raise policy.IdentityPolicyError("verify_doc_key_mismatch")
	else:
		meta = {"mime": submission.mime}
	await redis_client.delete(_doc_upload_key(user.id))

	pool = await get_pool()
	async with pool.acquire() as conn:
		verification_id = uuid4()
		now = _utcnow()
		evidence = {
			"s3_key": submission.key,
			"mime": meta.get("mime") or submission.mime,
		}
		await conn.execute(
			"""
			INSERT INTO verifications (id, user_id, method, state, evidence, reason, created_at)
			VALUES ($1, $2, 'doc', 'pending', $3, NULL, $4)
			""",
			verification_id,
			user.id,
			evidence,
			now,
		)
		row = await conn.fetchrow(
			"""
			SELECT id, user_id, method, state, evidence, reason, expires_at, created_at, decided_at
			FROM verifications
			WHERE id = $1
			""",
			verification_id,
		)

	obs_metrics.inc_verify_doc_submit("pending")
	return _row_to_entry(row)


async def list_review_queue(state: str = "pending", limit: int = 50) -> list[schemas.VerificationEntry]:
	verifications = await review.list_queue(state=state, limit=limit)
	return [
		schemas.VerificationEntry(
			id=item.id,
			user_id=item.user_id,
			method=item.method,
			state=item.state,
			evidence=item.evidence,
			reason=item.reason,
			expires_at=item.expires_at,
			created_at=item.created_at,
			decided_at=item.decided_at,
		)
		for item in verifications
	]


async def decide_review(moderator: AuthenticatedUser, verification_id: str, decision: schemas.AdminVerificationDecision) -> schemas.VerificationEntry:
	updated = await review.apply_decision(moderator, verification_id, decision)
	return schemas.VerificationEntry(
		id=updated.id,
		user_id=updated.user_id,
		method=updated.method,
		state=updated.state,
		evidence=updated.evidence,
		reason=updated.reason,
		expires_at=updated.expires_at,
		created_at=updated.created_at,
		decided_at=updated.decided_at,
	)

