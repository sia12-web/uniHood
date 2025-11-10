"""Background job scanning for engagement anomalies triggered by anti-gaming filters."""

from __future__ import annotations

from typing import Sequence

import asyncpg

from app.infra.postgres import get_pool
from app.obs import metrics as obs_metrics

_ANOMALY_THRESHOLD = 0.5  # weighted engagement must be at least 50% of raw


class AntiGamingAnomalyJob:
	"""Detect posts whose weighted engagement suggests coordinated gaming."""

	async def run_once(self) -> None:
		pool = await get_pool()
		async with pool.acquire() as conn:
			rows = await self._query_anomalies(conn)
		for row in rows:
			obs_metrics.ANTI_GAMING_FLAGS.labels(reason="anomaly").inc()
			# Future: emit moderation flag event / enqueue case creation

	async def _query_anomalies(self, conn: asyncpg.Connection) -> Sequence[asyncpg.Record]:
		return await conn.fetch(
			"""
			WITH recent AS (
				SELECT r.subject_id,
				       COUNT(*) AS raw_count,
				       SUM(r.effective_weight) AS weighted_sum
				FROM reaction r
				WHERE r.subject_type = 'post'
				  AND r.created_at >= NOW() - INTERVAL '1 hour'
				GROUP BY r.subject_id
			)
			SELECT subject_id, raw_count, weighted_sum
			FROM recent
			WHERE raw_count > 0 AND COALESCE(weighted_sum, 0) < raw_count * $1
			ORDER BY raw_count DESC
			LIMIT 50
			""",
			_ANOMALY_THRESHOLD,
		)