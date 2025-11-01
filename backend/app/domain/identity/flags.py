"""Feature flag storage, overrides, and evaluation helpers."""

from __future__ import annotations

import hashlib
import json
from typing import Any, Dict, Iterable, Optional

from app.domain.identity import policy, schemas
from app.infra.postgres import get_pool
from app.infra.redis import redis_client
from app.obs import metrics as obs_metrics

ALLOWED_KINDS: set[str] = {"bool", "percentage", "allowlist", "experiment"}
FLAG_CACHE_TTL_SECONDS = 5 * 60


def _flag_cache_key(key: str) -> str:
	return f"flag:def:{key}"


def _serialize_flag(flag: schemas.FeatureFlagOut) -> str:
	return json.dumps(flag.model_dump(mode="json"))


def _deserialize_flag(raw: str) -> schemas.FeatureFlagOut:
	return schemas.FeatureFlagOut(**json.loads(raw))


async def _get_flag_from_db(key: str) -> Optional[schemas.FeatureFlagOut]:
	pool = await get_pool()
	async with pool.acquire() as conn:
		row = await conn.fetchrow(
			"SELECT key, kind, description, payload FROM feature_flags WHERE key = $1",
			key,
		)
	if not row:
		return None
	return schemas.FeatureFlagOut(
		key=row["key"],
		kind=row["kind"],
		description=row.get("description", ""),
		payload=dict(row.get("payload") or {}),
	)


async def get_flag(key: str) -> Optional[schemas.FeatureFlagOut]:
	cache_key = _flag_cache_key(key)
	cached = await redis_client.get(cache_key)
	if cached:
		if isinstance(cached, bytes):
			cached = cached.decode("utf-8")
		return _deserialize_flag(cached)
	flag = await _get_flag_from_db(key)
	if flag:
		await redis_client.set(cache_key, _serialize_flag(flag), ex=FLAG_CACHE_TTL_SECONDS)
	return flag


async def list_flags() -> list[schemas.FeatureFlagOut]:
	pool = await get_pool()
	async with pool.acquire() as conn:
		rows = await conn.fetch("SELECT key, kind, description, payload FROM feature_flags ORDER BY key ASC")
	return [
		schemas.FeatureFlagOut(
			key=row["key"],
			kind=row["kind"],
			description=row.get("description", ""),
			payload=dict(row.get("payload") or {}),
		)
		for row in rows
	]


def _validate_kind(kind: str) -> None:
	if kind not in ALLOWED_KINDS:
		raise policy.IdentityPolicyError("flag_kind_invalid")


async def upsert_flag(actor_id: str, payload: schemas.FeatureFlagUpsertRequest) -> schemas.FeatureFlagOut:
	_validate_kind(payload.kind)
	await policy.enforce_flags_update_rate(actor_id)
	pool = await get_pool()
	async with pool.acquire() as conn:
		row = await conn.fetchrow(
			"""
			INSERT INTO feature_flags (key, kind, description, payload)
			VALUES ($1, $2, $3, $4)
			ON CONFLICT (key)
			DO UPDATE SET kind = EXCLUDED.kind,
				description = EXCLUDED.description,
				payload = EXCLUDED.payload
			RETURNING key, kind, description, payload
			""",
			payload.key,
			payload.kind,
			payload.description or "",
			payload.payload or {},
		)
	flag = schemas.FeatureFlagOut(
		key=row["key"],
		kind=row["kind"],
		description=row.get("description", ""),
		payload=dict(row.get("payload") or {}),
	)
	await redis_client.delete(_flag_cache_key(flag.key))
	obs_metrics.FLAGS_UPSERT.labels(key=flag.key, kind=flag.kind).inc()
	return flag


async def delete_flag(actor_id: str, key: str) -> None:
	await policy.enforce_flags_update_rate(actor_id)
	pool = await get_pool()
	async with pool.acquire() as conn:
		await conn.execute("DELETE FROM flag_overrides WHERE key = $1", key)
		await conn.execute("DELETE FROM feature_flags WHERE key = $1", key)
	await redis_client.delete(_flag_cache_key(key))


async def list_overrides(
	key: str,
	*,
	user_id: Optional[str] = None,
	campus_id: Optional[str] = None,
) -> list[schemas.FlagOverrideOut]:
	pool = await get_pool()
	async with pool.acquire() as conn:
		rows = await conn.fetch(
			"""
			SELECT key, user_id, campus_id, value, created_at
			FROM flag_overrides
			WHERE key = $1
			ORDER BY created_at DESC
			""",
			key,
		)
	return [
		schemas.FlagOverrideOut(
			key=row["key"],
			user_id=row.get("user_id"),
			campus_id=row.get("campus_id"),
			value=dict(row.get("value") or {}),
			created_at=row["created_at"],
		)
		for row in rows
		if (user_id is None or str(row.get("user_id")) == user_id)
		and (campus_id is None or str(row.get("campus_id")) == campus_id)
	]


async def upsert_override(actor_id: str, payload: schemas.FlagOverrideRequest) -> schemas.FlagOverrideOut:
	await policy.enforce_flags_update_rate(actor_id)
	if not payload.user_id and not payload.campus_id:
		raise policy.IdentityPolicyError("override_scope_missing")
	pool = await get_pool()
	async with pool.acquire() as conn:
		async with conn.transaction():
			flag_exists = await conn.fetchval("SELECT 1 FROM feature_flags WHERE key = $1", payload.key)
			if not flag_exists:
				raise policy.IdentityPolicyError("flag_not_found")
			row = await conn.fetchrow(
				"""
				INSERT INTO flag_overrides (key, user_id, campus_id, value)
				VALUES ($1, $2, $3, $4)
				ON CONFLICT (key, user_id, campus_id)
				DO UPDATE SET value = EXCLUDED.value,
					created_at = NOW()
				RETURNING key, user_id, campus_id, value, created_at
				""",
				payload.key,
				payload.user_id,
				payload.campus_id,
				payload.value,
			)
	override = schemas.FlagOverrideOut(
		key=row["key"],
		user_id=row.get("user_id"),
		campus_id=row.get("campus_id"),
		value=dict(row.get("value") or {}),
		created_at=row["created_at"],
	)
	await redis_client.delete(_flag_cache_key(payload.key))
	return override


async def delete_override(actor_id: str, payload: schemas.FlagOverrideDeleteRequest) -> None:
	await policy.enforce_flags_update_rate(actor_id)
	if not payload.user_id and not payload.campus_id:
		raise policy.IdentityPolicyError("override_scope_missing")
	pool = await get_pool()
	async with pool.acquire() as conn:
		await conn.execute(
			"""
			DELETE FROM flag_overrides
			WHERE key = $1
			  AND user_id IS NOT DISTINCT FROM $2
			  AND campus_id IS NOT DISTINCT FROM $3
			""",
			payload.key,
			payload.user_id,
			payload.campus_id,
		)
	await redis_client.delete(_flag_cache_key(payload.key))


def _override_to_result(value: Dict[str, Any]) -> schemas.FlagEvaluationResult:
	enabled = value.get("enabled")
	variant = value.get("variant")
	meta = dict(value.get("meta") or {})
	if enabled is None and variant is not None:
		enabled = True
	return schemas.FlagEvaluationResult(enabled=enabled, variant=variant, meta=meta)


def _hash_to_percentage(key: str, user_id: str) -> float:
	digest = hashlib.sha256(f"{key}:{user_id}".encode("utf-8")).hexdigest()
	return (int(digest[:8], 16) / 0xFFFFFFFF) * 100.0


def _evaluate_bool(flag: schemas.FeatureFlagOut) -> schemas.FlagEvaluationResult:
	enabled = bool(flag.payload.get("enabled", False))
	return schemas.FlagEvaluationResult(enabled=enabled, meta={"source": "flag"})


def _evaluate_percentage(flag: schemas.FeatureFlagOut, user_id: str) -> schemas.FlagEvaluationResult:
	threshold = float(flag.payload.get("percentage", 0))
	variant = flag.payload.get("variant")
	value = _hash_to_percentage(flag.key, user_id)
	enabled = value < threshold
	return schemas.FlagEvaluationResult(
		enabled=enabled,
		variant=variant if enabled else None,
		meta={"source": "percentage", "threshold": threshold, "value": value},
	)


def _evaluate_allowlist(
	flag: schemas.FeatureFlagOut,
	*,
	user_id: str,
	campus_id: Optional[str],
	traits: Optional[Dict[str, Any]],
) -> schemas.FlagEvaluationResult:
	allowed_users = {str(uid) for uid in flag.payload.get("user_ids", [])}
	allowed_campuses = {str(cid) for cid in flag.payload.get("campus_ids", [])}
	allowed_handles = {str(handle).lower() for handle in flag.payload.get("handles", [])}
	handle = (traits or {}).get("handle")
	enabled = False
	meta: Dict[str, Any] = {"source": "allowlist"}
	if user_id in allowed_users:
		enabled = True
		meta["match"] = "user"
	elif campus_id and campus_id in allowed_campuses:
		enabled = True
		meta["match"] = "campus"
	elif handle and str(handle).lower() in allowed_handles:
		enabled = True
		meta["match"] = "handle"
	return schemas.FlagEvaluationResult(enabled=enabled, meta=meta)


def _evaluate_experiment(flag: schemas.FeatureFlagOut, user_id: str) -> schemas.FlagEvaluationResult:
	variants: Iterable[Dict[str, Any]] = flag.payload.get("variants", [])
	cumulative = 0.0
	roll = _hash_to_percentage(flag.key, user_id)
	chosen: Optional[Dict[str, Any]] = None
	for variant in variants:
		weight = float(variant.get("weight", 0))
		cumulative += weight
		if roll <= cumulative and chosen is None:
			chosen = variant
	if not chosen and variants:
		chosen = list(variants)[-1]
	enabled = False
	variant_name: Optional[str] = None
	if chosen:
		variant_name = str(chosen.get("name")) if chosen.get("name") else None
		enabled = bool(chosen.get("enabled", True))
	return schemas.FlagEvaluationResult(
		enabled=enabled,
		variant=variant_name,
		meta={"source": "experiment", "roll": roll},
	)


async def evaluate_flag(
	key: str,
	*,
	user_id: str,
	campus_id: Optional[str],
	traits: Optional[Dict[str, Any]] = None,
) -> schemas.FlagEvaluationResult:
	flag = await get_flag(key)
	if not flag:
		return schemas.FlagEvaluationResult(enabled=None, meta={"reason": "flag_not_found"})
	pool = await get_pool()
	async with pool.acquire() as conn:
		row = await conn.fetchrow(
			"""
			SELECT key, user_id, campus_id, value
			FROM flag_overrides
			WHERE key = $1
			  AND (
			    (user_id IS NOT NULL AND user_id = $2)
			    OR ($3 IS NOT NULL AND campus_id IS NOT NULL AND campus_id = $3)
			  )
			ORDER BY CASE WHEN user_id = $2 THEN 0 ELSE 1 END, created_at DESC
			LIMIT 1
			""",
			key,
			user_id,
			campus_id,
		)
	if row:
		result = _override_to_result(dict(row.get("value") or {}))
		result.meta["source"] = result.meta.get("source", "override")
		obs_metrics.FLAGS_EVAL.labels(key=flag.key, kind=flag.kind).inc()
		return result
	if flag.kind == "bool":
		result = _evaluate_bool(flag)
	elif flag.kind == "percentage":
		result = _evaluate_percentage(flag, user_id)
	elif flag.kind == "allowlist":
		result = _evaluate_allowlist(flag, user_id=user_id, campus_id=campus_id, traits=traits)
	else:
		result = _evaluate_experiment(flag, user_id)
	obs_metrics.FLAGS_EVAL.labels(key=flag.key, kind=flag.kind).inc()
	return result
