"""Consent policies and acceptance tracking."""

from __future__ import annotations

from typing import Dict, Optional

from app.domain.identity import policy, schemas
from app.infra.postgres import get_pool
from app.obs import metrics as obs_metrics


async def list_policies() -> list[schemas.PolicyDocumentOut]:
	pool = await get_pool()
	async with pool.acquire() as conn:
		rows = await conn.fetch(
			"""
			SELECT slug, version, title, content_md, required, created_at
			FROM policy_documents
			ORDER BY created_at DESC
			"""
		)
	return [
		schemas.PolicyDocumentOut(
			slug=row["slug"],
			version=row["version"],
			title=row["title"],
			content_md=row.get("content_md", ""),
			required=bool(row.get("required", True)),
			created_at=row["created_at"],
		)
		for row in rows
	]


async def get_policy(slug: str, *, version: Optional[str] = None) -> schemas.PolicyDocumentOut:
	pool = await get_pool()
	async with pool.acquire() as conn:
		if version:
			row = await conn.fetchrow(
				"""
				SELECT slug, version, title, content_md, required, created_at
				FROM policy_documents
				WHERE slug = $1 AND version = $2
				""",
				slug,
				version,
			)
		else:
			row = await conn.fetchrow(
				"""
				SELECT slug, version, title, content_md, required, created_at
				FROM policy_documents
				WHERE slug = $1
				ORDER BY created_at DESC
				LIMIT 1
				""",
				slug,
			)
	if not row:
		raise policy.IdentityPolicyError("policy_not_found")
	return schemas.PolicyDocumentOut(
		slug=row["slug"],
		version=row["version"],
		title=row["title"],
		content_md=row.get("content_md", ""),
		required=bool(row.get("required", True)),
		created_at=row["created_at"],
	)


async def list_user_consents(user_id: str) -> list[schemas.ConsentRecordOut]:
	pool = await get_pool()
	async with pool.acquire() as conn:
		rows = await conn.fetch(
			"""
			SELECT policy_slug, version, accepted, accepted_at, meta
			FROM user_consents
			WHERE user_id = $1
			ORDER BY accepted_at DESC
			""",
			user_id,
		)
	return [
		schemas.ConsentRecordOut(
			policy_slug=row["policy_slug"],
			version=row["version"],
			accepted=bool(row.get("accepted", False)),
			accepted_at=row["accepted_at"],
			meta=dict(row.get("meta") or {}),
		)
		for row in rows
	]


async def accept_consent(user_id: str, payload: schemas.ConsentAcceptRequest) -> list[schemas.ConsentRecordOut]:
	await policy.enforce_consent_update_rate(user_id)
	pool = await get_pool()
	async with pool.acquire() as conn:
		async with conn.transaction():
			policy_row = await conn.fetchrow(
				"""
				SELECT slug, version, required
				FROM policy_documents
				WHERE slug = $1 AND version = $2
				""",
				payload.slug,
				payload.version,
			)
			if not policy_row:
				raise policy.IdentityPolicyError("policy_not_found")
			await conn.execute(
				"""
				INSERT INTO user_consents (user_id, policy_slug, version, accepted, meta, accepted_at)
				VALUES ($1, $2, $3, $4, $5, NOW())
				ON CONFLICT (user_id, policy_slug)
				DO UPDATE SET version = EXCLUDED.version,
					accepted = EXCLUDED.accepted,
					meta = EXCLUDED.meta,
					accepted_at = NOW()
				""",
				user_id,
				payload.slug,
				payload.version,
				payload.accepted,
				payload.meta or {},
			)
	if payload.accepted:
		obs_metrics.CONSENT_ACCEPT.labels(slug=payload.slug, version=payload.version).inc()
	return await list_user_consents(user_id)


async def consent_gate(user_id: str) -> schemas.ConsentGateResponse:
	pool = await get_pool()
	async with pool.acquire() as conn:
		policy_rows = await conn.fetch(
			"""
			SELECT slug, version, title, required
			FROM policy_documents
			ORDER BY created_at DESC
			""",
		)
		consent_rows = await conn.fetch(
			"""
			SELECT policy_slug, version, accepted
			FROM user_consents
			WHERE user_id = $1
			""",
			user_id,
		)
	latest: Dict[str, schemas.PolicySummary] = {}
	for row in policy_rows:
		slug = row["slug"]
		if slug in latest:
			continue
		latest[slug] = schemas.PolicySummary(
			slug=slug,
			version=row["version"],
			required=bool(row.get("required", True)),
			title=row["title"],
		)
	accepted_versions: Dict[str, str] = {}
	for row in consent_rows:
		if row.get("accepted"):
			accepted_versions[row["policy_slug"]] = row["version"]
	missing: list[schemas.PolicySummary] = []
	for slug, summary in latest.items():
		if not summary.required:
			continue
		if accepted_versions.get(slug) == summary.version:
			continue
		missing.append(summary)
	return schemas.ConsentGateResponse(missing=missing)
