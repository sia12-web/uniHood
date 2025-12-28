"""Policy helpers and guard checks for meetups."""
from __future__ import annotations
from datetime import datetime, timezone
from typing import TYPE_CHECKING
from uuid import UUID

from fastapi import HTTPException
from app.domain.xp.service import XPService
from app.infra.postgres import get_pool

if TYPE_CHECKING:
    import asyncpg

# Level-based limits for meetups
LEVEL_MEETUP_CAPACITY = {
    1: 5,
    2: 10,
    3: 25,
    4: 50,
    5: 100,
    6: 999, # Golden tier
}

LEVEL_MAX_SIMULTANEOUS_HOSTING = {
    1: 1,
    2: 1,
    3: 2,
    4: 5,
    5: 10,
    6: 50,
}

LEVEL_MAX_JOINED_MEETUPS = {
    1: 5,
    2: 10,
    3: 20,
    4: 50,
    5: 100,
    6: 500,
}

LEVEL_DAILY_CREATE_LIMIT = {
    1: 3,
    2: 5,
    3: 10,
    4: 20,
    5: 50,
    6: 200,
}

LEVEL_DAILY_JOIN_LIMIT = {
    1: 3,
    2: 5,
    3: 8,
    4: 12,
    5: 15,
    6: 20,
}

async def enforce_create_limits(user_id: str, requested_capacity: int) -> None:
    xp_stats = await XPService().get_user_stats(user_id)
    level = xp_stats.current_level
    
    # 1. Check Capacity
    max_capacity = LEVEL_MEETUP_CAPACITY.get(level, 5)
    if requested_capacity > max_capacity:
        raise HTTPException(
            status_code=403, 
            detail=f"At level {level}, you can only host meetups for up to {max_capacity} people."
        )
    
    # 2. Check Simultaneous Hosting
    max_hosting = LEVEL_MAX_SIMULTANEOUS_HOSTING.get(level, 1)
    
    pool = await get_pool()
    async with pool.acquire() as conn:
        active_hosting = await conn.fetchval(
            """
            SELECT COUNT(*) 
            FROM meetups 
            WHERE creator_user_id = $1 
            AND status IN ('UPCOMING', 'ACTIVE')
            """,
            UUID(user_id)
        )
        
        if active_hosting >= max_hosting:
            raise HTTPException(
                status_code=403,
                detail=f"At level {level}, you can only host {max_hosting} active meetup(s) at a time."
            )
            
        # 3. Check Daily Creation Limit
        daily_create_limit = LEVEL_DAILY_CREATE_LIMIT.get(level, 3)
        created_today = await conn.fetchval(
            """
            SELECT COUNT(*)
            FROM meetups
            WHERE creator_user_id = $1
            AND created_at > NOW() - INTERVAL '24 hours'
            """,
            UUID(user_id)
        )
        
        if created_today >= daily_create_limit:
             raise HTTPException(
                status_code=429,
                detail=f"At level {level}, you can only create {daily_create_limit} meetups per day."
            )

async def enforce_join_limits(user_id: str) -> None:
    xp_stats = await XPService().get_user_stats(user_id)
    level = xp_stats.current_level
    
    max_joined = LEVEL_MAX_JOINED_MEETUPS.get(level, 5)
    
    pool = await get_pool()
    async with pool.acquire() as conn:
        active_joined = await conn.fetchval(
            """
            SELECT COUNT(*) 
            FROM meetup_participants mp
            JOIN meetups m ON mp.meetup_id = m.id
            WHERE mp.user_id = $1 
            AND mp.status = 'JOINED'
            AND m.status IN ('UPCOMING', 'ACTIVE')
            """,
            UUID(user_id)
        )
        
        if active_joined >= max_joined:
            raise HTTPException(
                status_code=403,
                detail=f"At level {level}, you can only join up to {max_joined} active meetups at a time."
            )
            
        # 2. Check Daily Join Limit
        daily_join_limit = LEVEL_DAILY_JOIN_LIMIT.get(level, 10)
        joined_today = await conn.fetchval(
            """
            SELECT COUNT(*)
            FROM meetup_participants
            WHERE user_id = $1
            AND joined_at > NOW() - INTERVAL '24 hours'
            """,
            UUID(user_id)
        )
        
        if joined_today >= daily_join_limit:
             raise HTTPException(
                status_code=429,
                detail=f"At level {level}, you can only join {daily_join_limit} meetups per day."
            )
