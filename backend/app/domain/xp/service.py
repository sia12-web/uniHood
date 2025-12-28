"""Service for Campus XP system."""

from __future__ import annotations

from typing import Optional
from uuid import UUID
from datetime import datetime

from app.domain.xp.models import (
    LEVEL_THRESHOLDS,
    XP_AMOUNTS,
    XPAction,
    UserXPStats,
)
from app.infra.postgres import get_pool
from app.infra.redis import redis_client


class XPService:
    """Service for managing user XP and levels."""

    def _calculate_level(self, total_xp: int) -> int:
        """Determine level based on total XP."""
        # Check levels from highest to lowest
        for level in sorted(LEVEL_THRESHOLDS.keys(), reverse=True):
            if total_xp >= LEVEL_THRESHOLDS[level]:
                return level
        return 1

    async def get_user_stats(self, user_id: str | UUID) -> UserXPStats:
        """Fetch XP stats for a user."""
        uid = str(user_id)
        pool = await get_pool()
        
        async with pool.acquire() as conn:
            row = await conn.fetchrow("""
                SELECT user_id, total_xp, current_level, last_updated_at
                FROM user_xp_stats
                WHERE user_id = $1
            """, uid)
            
            if row:
                return UserXPStats(
                    user_id=row["user_id"],
                    total_xp=row["total_xp"],
                    current_level=row["current_level"],
                    last_updated_at=row["last_updated_at"],
                )
            
            # Return empty stats if not found
            return UserXPStats(
                user_id=UUID(uid),
                total_xp=0,
                current_level=1,
                last_updated_at=None, # type: ignore
            )

    async def award_xp(self, user_id: str | UUID, action: XPAction, metadata: dict = None) -> UserXPStats:
        """Award XP to a user for a specific action."""
        uid = str(user_id)
        amount = XP_AMOUNTS.get(action, 0)
        
        # --- Anti-Cheat: Diminishing Returns ---
        if metadata and "host_id" in metadata:
            host_id = str(metadata["host_id"])
            # Don't apply diminishing returns if interacting with self (if that's even possible/allowed)
            if host_id != uid:
                amount = await self._apply_diminishing_returns(uid, host_id, action, amount)
        # ---------------------------------------
        
        if amount <= 0:
            # No XP for this action, just return current stats
            return await self.get_user_stats(uid)

        pool = await get_pool()
        async with pool.acquire() as conn:
            async with conn.transaction():
                # 1. Log the event
                await conn.execute("""
                    INSERT INTO xp_events (user_id, action_type, amount, metadata)
                    VALUES ($1, $2, $3, $4)
                """, uid, action.value, amount, metadata or {})

                # 2. Update stats and get new totals
                row = await conn.fetchrow("""
                    INSERT INTO user_xp_stats (user_id, total_xp, current_level)
                    VALUES ($1, $2, 1)
                    ON CONFLICT (user_id) DO UPDATE
                    SET total_xp = user_xp_stats.total_xp + $2,
                        last_updated_at = NOW()
                    RETURNING total_xp, current_level
                """, uid, amount)
                
                current_total = row["total_xp"]
                db_level = row["current_level"]
                
                # 3. Check for level up
                calculated_level = self._calculate_level(current_total)
                
                # Emit XP Gained Event
                from app.domain.xp import sockets
                # We do this inside transaction for safety, but ideal is AFTER commit. 
                # However, asyncpg doesn't fully support on_commit hooks easily here.
                # Fire and forget is okay for UI updates.
                await sockets.emit_xp_gained(uid, amount, action.value, current_total, calculated_level)
                
                if calculated_level != db_level:
                    await conn.execute("""
                        UPDATE user_xp_stats 
                        SET current_level = $1
                        WHERE user_id = $2
                    """, calculated_level, uid)
                    db_level = calculated_level
                    
                    # Trigger level up notification
                    await sockets.emit_level_up(uid, calculated_level)
                
                # Re-fetch strictly to match UserXPStats structure with ID
                return await self.get_user_stats(uid)

    async def award_daily_login(self, user_id: str | UUID) -> Optional[UserXPStats]:
        """Award XP for the first login of the day."""
        uid = str(user_id)
        pool = await get_pool()
        
        async with pool.acquire() as conn:
            # Try to insert a claim for today. If it fails (unique constraint), they already claimed it.
            try:
                await conn.execute("""
                    INSERT INTO daily_xp_claims (user_id, claim_date)
                    VALUES ($1, CURRENT_DATE)
                """, uid)
            except Exception:
                # Likely UniqueViolationError, but we catch all to be safe and silent
                return None
        
        # If we reached here, the insert succeeded. Award the XP.
        return await self.award_xp(user_id, XPAction.DAILY_LOGIN)

    async def _apply_diminishing_returns(self, user_id: str, target_id: str, action: XPAction, base_amount: int) -> int:
        """
        Apply diminishing returns to XP based on frequency of interaction with the same target.
        
        Rule (per 24h rolling window per target):
        - 1st interaction: 100% XP (50% if target is unverified)
        - 2nd interaction: 50% XP (25% if target is unverified)
        - 3rd+ interaction: 0% XP
        """
        # 1. Check Verified Status of Target (Sybil Dampening)
        is_verified = await self._is_user_verified(target_id)
        if not is_verified:
            base_amount = base_amount // 2
            
        redis = redis_client
        # Key: xp:dr:{user_id}:{target_id}:{action_type}:{yyyymmdd}
        # Using simple daily bucket for simplicity and auto-expiry
        today = datetime.now().strftime("%Y%m%d")
        key = f"xp:dr:{user_id}:{target_id}:{action.value}:{today}"
        
        # Increment and get new value
        # We set specific expiry of 24h + buffer to ensure it clears
        pipe = redis.pipeline()
        pipe.incr(key)
        pipe.expire(key, 86400)
        results = await pipe.execute()
        count = results[0]
        
        
        if count == 1:
            return base_amount
        elif count == 2:
            return base_amount // 2
        else:
            return 0

    async def _is_user_verified(self, user_id: str) -> bool:
        """Check if a user is university verified."""
        pool = await get_pool()
        async with pool.acquire() as conn:
            return await conn.fetchval(
                "SELECT is_university_verified FROM users WHERE id = $1",
                UUID(user_id)
            ) or False
