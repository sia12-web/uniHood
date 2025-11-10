"""Phase F feed ranking utilities."""

from __future__ import annotations

import math
from dataclasses import dataclass
from datetime import datetime, timezone
from time import perf_counter
from typing import Iterable, Optional

from app.obs import metrics as obs_metrics


@dataclass(slots=True)
class PostFeatures:
	"""Feature bundle required for scoring feed posts."""

	post_id: str
	author_id: str
	campus_id: Optional[str]
	created_at: datetime
	likes: float
	comments: int
	saves: int
	shares: int
	is_friend: bool
	is_fof: bool
	author_trust: float  # 0..1
	author_rep: float  # 0..1
	match_jaccard: float  # 0..1


@dataclass(slots=True)
class ScoredPost:
	"""Ranked post with score and metadata for pagination."""

	post_id: str
	score: float
	created_at: datetime
	author_id: str


def _exp_decay(created_at: datetime, tau_hours: float) -> float:
	"""Compute exponential freshness decay using the provided horizon."""

	now = datetime.now(timezone.utc)
	delta_hours = max(0.0, (now - created_at).total_seconds() / 3600.0)
	return math.exp(-delta_hours / max(0.1, tau_hours))


def score_post(feat: PostFeatures, coeff: dict[str, float]) -> float:
	"""Score a single post feature vector using weighted components."""

	alpha = float(coeff.get("alpha", 0.35))
	beta = float(coeff.get("beta", 0.35))
	gamma = float(coeff.get("gamma", 0.15))
	delta = float(coeff.get("delta", 0.05))
	epsilon = float(coeff.get("epsilon", 0.05))
	zeta = float(coeff.get("zeta", 0.05))

	# Engagement normalisation blends reactions with higher weights for deeper signals.
	engagement = feat.likes + 2 * feat.comments + 3 * feat.saves + 4 * feat.shares
	engagement_norm = 0.0
	if engagement > 0:
		# log normalisation: ~50 weighted events map close to 1.0
		engagement_norm = math.log1p(engagement) / math.log(50)

	social = 1.0 if feat.is_friend else (0.2 if feat.is_fof else 0.0)
	campus = 1.0  # candidates pre-filter same campus; fallback keeps legacy weight
	quality = max(0.0, min(1.0, 0.6 * feat.author_trust + 0.4 * feat.author_rep))
	freshness = _exp_decay(feat.created_at, tau_hours=8.0)

	score = (
		alpha * freshness
		+ beta * engagement_norm
		+ gamma * social
		+ delta * campus
		+ epsilon * max(0.0, min(1.0, feat.match_jaccard))
		+ zeta * quality
	)
	return float(score)


def rank_posts(features: Iterable[PostFeatures], coeff: dict[str, float]) -> list[ScoredPost]:
	"""Score and order candidate posts.

	The caller is responsible for applying cursor pagination and diversity caps.
	"""

	start = perf_counter()
	scored: list[ScoredPost] = []
	for feat in features:
		score = score_post(feat, coeff)
		scored.append(
			ScoredPost(
				post_id=feat.post_id,
				score=score,
				created_at=feat.created_at,
				author_id=feat.author_id,
			)
		)

	scored.sort(key=lambda item: (item.score, item.created_at.timestamp(), item.post_id), reverse=True)

	elapsed_ms = (perf_counter() - start) * 1000.0
	if scored:
		obs_metrics.FEED_RANK_CANDIDATES.inc(len(scored))
		obs_metrics.FEED_RANK_SCORE_AVG.set(sum(item.score for item in scored[:20]) / min(len(scored), 20))
	obs_metrics.FEED_RANK_DURATION.observe(elapsed_ms)
	return scored


__all__ = ["PostFeatures", "ScoredPost", "rank_posts", "score_post"]
