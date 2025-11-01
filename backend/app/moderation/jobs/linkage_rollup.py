"""Roll-up job that refreshes linkage cluster strengths."""

from __future__ import annotations

from typing import Iterable, Mapping

from app.moderation.domain.linkage import LinkageService


async def run(
    service: LinkageService,
    *,
    updates: Mapping[str, Iterable[tuple[str, str, int]]],
) -> int:
    """Apply strength updates per cluster.

    ``updates`` is a mapping of ``cluster_id -> iterable`` where each item is
    ``(user_id, relation, strength)``. The relation string should match one of
    the supported linkage relations (``shared_device``, ``shared_ip_24h``,
    ``shared_cookie_seed``).
    """

    applied = 0
    for cluster_id, records in updates.items():
        for user_id, relation, strength in records:
            relation = relation or "shared_device"
            if relation == "shared_ip_24h":
                await service.record_shared_ip(cluster_id=cluster_id, user_id=user_id, strength=strength)
            elif relation == "shared_cookie_seed":
                await service.record_cookie_seed(cluster_id=cluster_id, user_id=user_id, strength=strength)
            else:
                await service.record_shared_device(cluster_id=cluster_id, user_id=user_id, strength=strength)
            applied += 1
    return applied
