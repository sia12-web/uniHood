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

    async def get_recent_activity(self, limit: int = 20, current_user_id: Optional[str] = None) -> List[schemas.ActivityLogItem]:
        pool = await self._get_pool()
        async with pool.acquire() as conn:
            # Join with users to get display names
            # Join with activity_likes to get counts and current user's status
            rows = await conn.fetch(
                """
                SELECT a.id, a.user_id, a.event, a.meta, a.created_at,
                       u.display_name, u.avatar_url, u.handle,
                       (SELECT COUNT(*) FROM activity_likes WHERE audit_log_id = a.id) as likes_count,
                       CASE WHEN $2::uuid IS NULL THEN FALSE
                            ELSE EXISTS(SELECT 1 FROM activity_likes WHERE audit_log_id = a.id AND user_id = $2::uuid)
                       END as is_liked
                FROM audit_logs a
                LEFT JOIN users u ON a.user_id = u.id
                WHERE (
                    a.event IN ('activity.create', 'activity.join')
                    OR (a.event = 'xp.gained' AND a.meta->>'action' = 'game_won')
                    OR (a.event = 'activity_completed' AND (a.meta->>'winner_id' IS NOT NULL OR a.meta->>'match_winner_id' IS NOT NULL))
                )
                AND (
                    $2::uuid IS NULL 
                    OR a.user_id = $2::uuid 
                    OR EXISTS(SELECT 1 FROM friendships f WHERE f.user_id = $2::uuid AND f.friend_id = a.user_id AND f.status = 'accepted')
                )
                ORDER BY a.created_at DESC
                LIMIT $1
                """,
                limit, current_user_id
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
                        user_avatar_url=r["avatar_url"],
                        likes_count=r["likes_count"],
                        is_liked=r["is_liked"]
                    )
                )
            return results

    async def toggle_like(self, user_id: str, audit_log_id: int) -> bool:
        """Toggle a like on an activity item. Returns True if liked, False if unliked."""
        pool = await self._get_pool()
        async with pool.acquire() as conn:
            existing = await conn.fetchval(
                "SELECT 1 FROM activity_likes WHERE audit_log_id = $1 AND user_id = $2",
                audit_log_id, user_id
            )
            if existing:
                await conn.execute(
                    "DELETE FROM activity_likes WHERE audit_log_id = $1 AND user_id = $2",
                    audit_log_id, user_id
                )
                return False
            else:
                await conn.execute(
                    "INSERT INTO activity_likes (audit_log_id, user_id) VALUES ($1, $2)",
                    audit_log_id, user_id
                )
                return True
