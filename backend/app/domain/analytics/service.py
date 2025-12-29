from __future__ import annotations

from typing import List, Dict, Any, Optional
from datetime import datetime
import json

import asyncpg
from app.infra.postgres import get_pool
from app.domain.analytics import schemas
from app.domain.meetups import schemas as meetup_schemas
from app.domain.activities import models as activity_models

class AnalyticsService:
    async def _get_pool(self) -> asyncpg.Pool:
        return await get_pool()

    async def get_overview(self) -> schemas.AnalyticsOverview:
        pool = await self._get_pool()
        async with pool.acquire() as conn:
            # Parallel or batched queries for efficiency
            total_meetups = await conn.fetchval("SELECT COUNT(*) FROM meetups")
            total_games = await conn.fetchval("SELECT COUNT(*) FROM activities WHERE state = 'completed'")
            
            # Active counts (approximate based on status/state)
            active_meetups = await conn.fetchval(
                "SELECT COUNT(*) FROM meetups WHERE status IN ('ACTIVE', 'UPCOMING')"
            )
            active_games = await conn.fetchval(
                "SELECT COUNT(*) FROM activities WHERE state IN ('active', 'lobby')"
            )

            return schemas.AnalyticsOverview(
                total_meetups_created=total_meetups or 0,
                total_games_played=total_games or 0,
                active_meetups_count=active_meetups or 0,
                active_games_count=active_games or 0
            )

    async def get_popular_games(self, limit: int = 5) -> List[schemas.PopularGameItem]:
        pool = await self._get_pool()
        async with pool.acquire() as conn:
            rows = await conn.fetch(
                """
                SELECT kind, COUNT(*) as play_count, MAX(created_at) as last_played
                FROM activities
                WHERE state = 'completed'
                GROUP BY kind
                ORDER BY play_count DESC
                LIMIT $1
                """,
                limit
            )
            return [
                schemas.PopularGameItem(
                    game_kind=r["kind"],
                    play_count=r["play_count"],
                    last_played_at=r["last_played"]
                )
                for r in rows
            ]

    async def get_popular_meetup_types(self, limit: int = 5) -> List[schemas.PopularMeetupTypeItem]:
        pool = await self._get_pool()
        async with pool.acquire() as conn:
            rows = await conn.fetch(
                """
                SELECT category, COUNT(*) as count
                FROM meetups
                GROUP BY category
                ORDER BY count DESC
                LIMIT $1
                """,
                limit
            )
            return [
                schemas.PopularMeetupTypeItem(
                    category=r["category"],
                    count=r["count"]
                )
                for r in rows
            ]

    async def get_recent_activity(self, limit: int = 20) -> List[schemas.ActivityLogItem]:
        pool = await self._get_pool()
        async with pool.acquire() as conn:
            # Join with users to get display names
            rows = await conn.fetch(
                """
                SELECT a.id, a.user_id, a.event, a.meta, a.created_at,
                       u.display_name, u.avatar_url, u.handle
                FROM audit_log a
                LEFT JOIN users u ON a.user_id::uuid = u.id
                ORDER BY a.created_at DESC
                LIMIT $1
                """,
                limit
            )
            
            results = []
            for r in rows:
                meta = r["meta"]
                if isinstance(meta, str):
                    meta = json.loads(meta)
                elif meta is None:
                    meta = {}
                
                results.append(
                    schemas.ActivityLogItem(
                        id=r["id"],
                        user_id=str(r["user_id"]),
                        event=r["event"],
                        meta=meta,
                        created_at=r["created_at"],
                        user_display_name=r["display_name"] or r["handle"],
                        user_avatar_url=r["avatar_url"]
                    )
                )
            return results
