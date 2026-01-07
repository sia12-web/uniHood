"""Service for Campus XP system."""

from __future__ import annotations

from typing import Optional
from uuid import UUID
from datetime import datetime

import logging
import json
from app.domain.xp.models import (
    LEVEL_THRESHOLDS,
    XP_AMOUNTS,
    XPAction,
    UserXPStats,
)
from app.domain.identity import audit
from app.infra.postgres import get_pool
from app.infra.redis import redis_client

logger = logging.getLogger(__name__)


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
            
            logger.warning(f"XP stats not found for user {uid}, returning defaults")
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
        target_id = None
        if metadata:
            target_id = metadata.get("host_id") or metadata.get("target_id") or metadata.get("to")
        
        if target_id:
            target_id = str(target_id)
            # Don't apply diminishing returns if interacting with self
            # Also don't apply for negative XP (penalties shouldn't diminish)
            if target_id != uid and amount > 0:
                amount = await self._apply_diminishing_returns(uid, target_id, action, amount)
        # ---------------------------------------
        
        if amount == 0:
            # No XP change for this action, just return current stats
            return await self.get_user_stats(uid)

        pool = await get_pool()
        async with pool.acquire() as conn:
            async with conn.transaction():
                # 1. Log the event
                await conn.execute("""
                    INSERT INTO xp_events (user_id, action_type, amount, metadata)
                    VALUES ($1, $2, $3, $4::jsonb)
                """, uid, action.value, amount, json.dumps(metadata or {}))

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
                
                # Emit XP Gained Event (only for non-zero amounts)
                from app.domain.xp import sockets
                # We do this inside transaction for safety, but ideal is AFTER commit. 
                # However, asyncpg doesn't fully support on_commit hooks easily here.
                # Fire and forget is okay for UI updates.
                if amount != 0:
                    await sockets.emit_xp_gained(uid, amount, action.value, current_total, calculated_level)

                # Log to Activity Feed (Audit)
                try:
                    await audit.log_event(
                        user_id=uid,
                        event="xp.gained",
                        meta={
                            "action": action.value,
                            "amount": amount,
                            "total_xp": current_total,
                            "level": calculated_level,
                            "source_meta": metadata or {}
                        }
                    )
                except Exception:
                    logger.warning("Failed to log XP audit event", exc_info=True)
                
                if calculated_level != db_level:
                    await conn.execute("""
                        UPDATE user_xp_stats 
                        SET current_level = $1
                        WHERE user_id = $2
                    """, calculated_level, uid)
                    db_level = calculated_level
                    
                    # Trigger level up notification
                    await sockets.emit_level_up(uid, calculated_level)
                    
                    # Log to Activity Feed (Audit)
                    try:
                        await audit.log_event(
                            user_id=uid,
                            event="level.up",
                            meta={"level": calculated_level}
                        )
                    except Exception:
                        logger.warning("Failed to log level up audit event", exc_info=True)
                
                # Re-fetch strictly to match UserXPStats structure with ID
                return await self.get_user_stats(uid)

