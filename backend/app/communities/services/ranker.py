"""Ranking helpers for communities feeds."""

from __future__ import annotations

import math
from datetime import datetime, timezone

from app.communities.domain import models


def compute_rank(post: models.Post, *, now: datetime | None = None) -> float:
    """Compute the feed rank score for a post.

    Implements the Phase 2 specification: exponential time decay with a
    6-hour decay constant, engagement weighting, and a pin boost multiplier.
    """

    current_time = now or datetime.now(timezone.utc)
    age_hours = max((current_time - post.created_at).total_seconds() / 3600.0, 0.0)
    time_decay = math.exp(-age_hours / 6.0)
    engagement = math.log1p(post.reactions_count + 3 * post.comments_count)
    pin_boost = 1.5 if post.is_pinned else 1.0
    return round((time_decay + 0.05 * engagement) * pin_boost, 6)


__all__ = ["compute_rank"]
