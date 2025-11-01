from __future__ import annotations

import importlib
from pathlib import Path
from unittest.mock import MagicMock, patch

import asyncpg

from app.infra.redis import RedisProxy
from app.moderation.domain import container
from app.moderation.infra.ip_reputation_repo import PostgresIpReputationRepository
from app.moderation.infra.linkage_repo import PostgresLinkageRepository
from app.moderation.infra.reputation_repo import PostgresReputationRepository
from app.moderation.infra.restriction_repo import PostgresRestrictionRepository


class _StubRedis:
    async def incr(self, key: str) -> int:
        return 1

    async def expire(self, key: str, seconds: int) -> bool:
        return True

    async def ttl(self, key: str) -> int:
        return -1

    async def exists(self, key: str) -> bool:
        return False

    async def delete(self, *keys: str) -> int:
        return 0


def test_configure_postgres_uses_production_repositories(tmp_path: Path) -> None:
    importlib.reload(container)
    pool = MagicMock(spec=asyncpg.Pool)
    redis_proxy = RedisProxy(_StubRedis())
    config_path = tmp_path / "reputation.yml"
    config_path.write_text(
        "surfaces:\n"
        "  post:\n"
        "    windows:\n"
        "      - name: w1\n"
        "        seconds: 60\n"
        "        limit: 5\n"
        "        cooldown_minutes: 10\n"
        "band_multipliers:\n"
        "  good: 1.0\n"
        "shadow_defaults:\n"
        "  ttl_hours: 36\n"
        "captcha:\n"
        "  ttl_hours: 12\n"
        "honey:\n"
        "  shadow_hours: 48\n"
        "  captcha_hours: 24\n"
        "link_cooloff:\n"
        "  ttl_hours: 72\n",
        encoding="utf-8",
    )

    try:
        with patch.object(container.DetectorSuite, "from_redis", return_value=container.DetectorSuite()):
            container.configure_postgres(
                pool,
                redis_proxy,
                reputation_config_path=str(config_path),
            )

        reputation_service = container.get_reputation_service()
        restriction_service = container.get_restriction_service()
        linkage_service = container.get_linkage_service()
        ip_service = container.get_ip_enrichment_service()
        gate = container.get_write_gate()

        assert isinstance(reputation_service._repo, PostgresReputationRepository)
        assert isinstance(restriction_service._repo, PostgresRestrictionRepository)
        assert isinstance(linkage_service._repo, PostgresLinkageRepository)
        assert isinstance(ip_service._repo, PostgresIpReputationRepository)
        assert getattr(gate, "_shadow_ttl_hours") == 36
        assert getattr(gate, "_captcha_ttl_hours") == 12
        assert getattr(gate, "_honey_shadow_hours") == 48
        assert getattr(gate, "_honey_captcha_hours") == 24
        assert getattr(gate, "_link_cooloff_hours") == 72
    finally:
        importlib.reload(container)
