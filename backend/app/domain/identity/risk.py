"""Risk scoring engine for login anomaly detection and session flags."""

from __future__ import annotations

import json
import math
from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Iterable, Mapping, Optional
from uuid import UUID

import asyncpg

from app.domain.identity import models, policy
from app.infra.postgres import get_pool
from app.infra.redis import redis_client
from app.obs import metrics as obs_metrics

GEO_KEY = "risk:geo:{user}"
UA_KEY = "risk:ua:{user}"


@dataclass(slots=True)
class RiskAssessment:
	score: int
	reasons: list[str]
	step_up_required: bool
	blocked: bool


def _now() -> datetime:
	return datetime.now(timezone.utc)


def _geo_key(user_id: str) -> str:
	return GEO_KEY.format(user=user_id)


def _ua_key(user_id: str) -> str:
	return UA_KEY.format(user=user_id)


def _ua_family(user_agent: Optional[str]) -> str:
	if not user_agent:
		return "unknown"
	ua = user_agent.lower()
	if "safari" in ua and "chrome" not in ua:
		return "safari"
	if "chrome" in ua and "edg" not in ua:
		return "chrome"
	if "firefox" in ua:
		return "firefox"
	if "edg" in ua:
		return "edge"
	return "other"


def _haversine_km(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
	radius = 6371.0
	phi1, phi2 = math.radians(lat1), math.radians(lat2)
	dphi = math.radians(lat2 - lat1)
	dlambda = math.radians(lon2 - lon1)
	a = math.sin(dphi / 2) ** 2 + math.cos(phi1) * math.cos(phi2) * math.sin(dlambda / 2) ** 2
	c = 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))
	return radius * c


def _load_geo_payload(raw: Optional[str]) -> Optional[dict[str, object]]:
	if not raw:
		return None
	try:
		return json.loads(raw)
	except json.JSONDecodeError:
		return None


async def _is_known_device(conn: asyncpg.Connection, user_id: str, user_agent: Optional[str]) -> bool:
	if not user_agent:
		return False
	row = await conn.fetchrow(
		"""
		SELECT 1
		FROM trusted_devices
		WHERE user_id = $1 AND user_agent = $2 AND revoked = FALSE
		LIMIT 1
		""",
		user_id,
		user_agent,
	)
	return bool(row)


async def _trust_level(conn: asyncpg.Connection, user_id: str) -> int:
	row = await conn.fetchrow(
		"SELECT trust_level FROM trust_profiles WHERE user_id = $1",
		user_id,
	)
	if not row:
		return 0
	return int(row.get("trust_level") or 0)


def _categorize(score: int, blocked: bool, step_up: bool) -> str:
	if blocked:
		return "blocked"
	if score >= policy.RISK_STEPUP_THRESHOLD:
		return "high"
	if score >= 30:
		return "med"
	return "low"


async def _persist_assessment(session_id: UUID, score: int, reasons: list[str], step_up: bool) -> None:
	pool = await get_pool()
	async with pool.acquire() as conn:
		await conn.execute(
			"""
			INSERT INTO session_risk (session_id, risk_score, reasons, step_up_required)
			VALUES ($1, $2, $3, $4)
			ON CONFLICT (session_id)
			DO UPDATE SET
				risk_score = EXCLUDED.risk_score,
				reasons = EXCLUDED.reasons,
				step_up_required = EXCLUDED.step_up_required,
				updated_at = NOW()
			""",
			session_id,
			score,
			reasons,
			step_up,
		)


async def evaluate_login(
	user: models.User,
	session_id: UUID,
	*,
	ip: Optional[str],
	user_agent: Optional[str],
	geo: Optional[Mapping[str, object]] = None,
) -> RiskAssessment:
	user_id = str(user.id)
	pool = await get_pool()
	async with pool.acquire() as conn:
		trust_level = await _trust_level(conn, user_id)
		known_device = await _is_known_device(conn, user_id, user_agent)

	score = 0
	reasons: list[str] = []
	ua_family = _ua_family(user_agent)
	previous_ua_raw = await redis_client.get(_ua_key(user_id))
	previous_ua = (previous_ua_raw.decode("utf-8") if isinstance(previous_ua_raw, bytes) else previous_ua_raw) or ""
	if previous_ua and previous_ua != ua_family:
		score += 15
		reasons.append("ua_family_change")
	await redis_client.set(_ua_key(user_id), ua_family, ex=policy.RISK_PROFILE_TTL_SECONDS)

	geo_payload = dict(geo or {})
	geo_payload.setdefault("ip", ip)
	geo_payload.setdefault("ts", _now().isoformat())
	last_geo_raw = await redis_client.get(_geo_key(user_id))
	last_geo = _load_geo_payload(last_geo_raw.decode("utf-8") if isinstance(last_geo_raw, bytes) else last_geo_raw)
	if last_geo and geo:
		last_country = str(last_geo.get("country") or "")
		country = str(geo.get("country") or "")
		if country and last_country and country.lower() != last_country.lower():
			score += 40
			reasons.append("country_change")
		last_city = str(last_geo.get("city") or "")
		city = str(geo.get("city") or "")
		if city and last_city and city.lower() != last_city.lower():
			score += 15
			reasons.append("city_change")
		try:
			prev_lat = float(last_geo.get("lat"))
			prev_lon = float(last_geo.get("lon"))
			curr_lat = float(geo.get("lat"))
			curr_lon = float(geo.get("lon"))
			prev_ts = datetime.fromisoformat(str(last_geo.get("ts"))) if last_geo.get("ts") else None
			curr_ts = datetime.fromisoformat(geo_payload["ts"]) if geo_payload.get("ts") else None
			if prev_ts and curr_ts and curr_ts > prev_ts:
				distance = _haversine_km(prev_lat, prev_lon, curr_lat, curr_lon)
				hours = max((curr_ts - prev_ts).total_seconds() / 3600.0, 0.001)
				velocity = distance / hours
				if velocity > 800:
					score += 30
					reasons.append("impossible_travel")
		except (TypeError, ValueError):
			pass
	await redis_client.set(_geo_key(user_id), json.dumps(geo_payload), ex=policy.RISK_PROFILE_TTL_SECONDS)

	if not known_device:
		score += 10
		reasons.append("new_device")

	if trust_level <= 0:
		score += 10
		reasons.append("low_trust")

	score = min(score, 100)
	blocked = score >= policy.RISK_BLOCK_THRESHOLD
	step_up = score >= policy.RISK_STEPUP_THRESHOLD
	await _persist_assessment(session_id, score, reasons, step_up)
	obs_metrics.inc_risk_login(_categorize(score, blocked, step_up))
	return RiskAssessment(score=score, reasons=reasons, step_up_required=step_up, blocked=blocked)


async def load_risk_for_sessions(session_ids: Iterable[UUID]) -> dict[UUID, models.SessionRisk]:
	ids = list(session_ids)
	if not ids:
		return {}
	pool = await get_pool()
	async with pool.acquire() as conn:
		rows = await conn.fetch(
			"""
			SELECT session_id, risk_score, reasons, step_up_required, created_at, updated_at
			FROM session_risk
			WHERE session_id = ANY($1::uuid[])
			""",
			tids,
		)
	return {UUID(str(row["session_id"])): models.SessionRisk.from_record(row) for row in rows}
