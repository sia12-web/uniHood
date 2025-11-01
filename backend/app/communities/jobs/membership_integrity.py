"""Membership integrity job ensures moderation states stay consistent."""

from __future__ import annotations

from datetime import datetime, timezone

from app.communities.domain import repo as repo_module
from app.obs import metrics as obs_metrics

_JOB_NAME = "communities-membership-integrity"


class MembershipIntegrityJob:
	"""Clears expired mutes and can be extended for further checks."""

	def __init__(self, *, repository: repo_module.CommunitiesRepository | None = None) -> None:
		self.repo = repository or repo_module.CommunitiesRepository()

	async def run_once(self) -> int:
		started = datetime.now(timezone.utc)
		try:
			cleared = await self.repo.clear_expired_mutes()
			obs_metrics.BACKGROUND_RUNS.labels(name=_JOB_NAME, result="success").inc()
			return cleared
		except Exception:  # pragma: no cover
			obs_metrics.BACKGROUND_RUNS.labels(name=_JOB_NAME, result="error").inc()
			raise
		finally:
			duration = (datetime.now(timezone.utc) - started).total_seconds()
			obs_metrics.BACKGROUND_DURATION.labels(name=_JOB_NAME).observe(duration)
