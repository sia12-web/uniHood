"""Moderation queue operations for verification document review."""

from __future__ import annotations

from datetime import datetime, timedelta, timezone
from typing import List, Optional
from uuid import UUID

from app.domain.identity import models, policy, schemas, trust
from app.infra.auth import AuthenticatedUser
from app.infra.postgres import get_pool
from app.infra.redis import redis_client
from app.obs import metrics as obs_metrics


def _now() -> datetime:
	return datetime.now(timezone.utc)


def _lock_key(verification_id: str | UUID) -> str:
	return f"admin:verify:lock:{verification_id}"


async def _acquire_lock(verification_id: str | UUID) -> None:
	key = _lock_key(verification_id)
	ok = await redis_client.set(key, "1", nx=True, ex=policy.REVIEW_LOCK_TTL_SECONDS)
	if not ok:
		raise policy.IdentityPolicyError("verification_locked")


async def _release_lock(verification_id: str | UUID) -> None:
	await redis_client.delete(_lock_key(verification_id))


async def list_queue(*, state: str = "pending", limit: int = 50) -> List[models.Verification]:
	pool = await get_pool()
	async with pool.acquire() as conn:
		rows = await conn.fetch(
			"""
			SELECT id, user_id, method, state, evidence, reason, expires_at, created_at, decided_at
			FROM verifications
			WHERE state = $1
			ORDER BY created_at ASC
			LIMIT $2
			""",
			state,
			limit,
		)
	return [models.Verification.from_record(row) for row in rows]


async def apply_decision(
	moderator: AuthenticatedUser,
	verification_id: str,
	decision: schemas.AdminVerificationDecision,
) -> models.Verification:
	await _acquire_lock(verification_id)
	try:
		pool = await get_pool()
		async with pool.acquire() as conn:
			async with conn.transaction():
				row = await conn.fetchrow(
					"""
					SELECT *
					FROM verifications
					WHERE id = $1
					FOR UPDATE
					""",
					verification_id,
				)
				if not row:
					raise policy.IdentityPolicyError("verification_not_found")
				verification = models.Verification.from_record(row)
				if verification.state not in {"pending", "expired"}:
					raise policy.IdentityPolicyError("verification_decided")
				new_state = "approved" if decision.approve else "rejected"
				now = _now()
				expires_at = verification.expires_at
				if decision.approve and (expires_at is None or expires_at <= now):
					expires_at = now + timedelta(days=365)
				reason = verification.reason
				if not decision.approve:
					reason = decision.note or "rejected"
				await conn.execute(
					"""
					UPDATE verifications
					SET state = $2,
						reason = $3,
						expires_at = $4,
						decided_at = $5
					WHERE id = $1
					""",
					verification_id,
					new_state,
					reason,
					expires_at,
					now,
				)
				await conn.execute(
					"""
					INSERT INTO verification_audit (verification_id, moderator_id, action, note)
					VALUES ($1, $2, $3, $4)
					""",
					verification_id,
					moderator.id,
					"approve" if decision.approve else "reject",
					decision.note,
				)
			updated = models.Verification(
				id=verification.id,
				user_id=verification.user_id,
				method=verification.method,
				state=new_state,
				evidence=verification.evidence,
				reason=reason,
				expires_at=expires_at,
				created_at=verification.created_at,
				decided_at=now,
			)
	finally:
		await _release_lock(verification_id)

	obs_metrics.inc_verify_admin_decision("approved" if decision.approve else "rejected")
	await trust.recompute_trust(str(updated.user_id))
	return updated
