import pytest
from unittest.mock import AsyncMock, MagicMock, patch
from uuid import uuid4
from datetime import datetime
from app.domain.xp.service import XPService
from app.domain.xp.models import XPAction

@pytest.mark.asyncio
async def test_award_xp_emits_xp_gained():
    service = XPService()
    user_id = str(uuid4())
    action = XPAction.MEETUP_JOIN

    # Mock DB interaction
    mock_pool = MagicMock()
    mock_conn = AsyncMock()
    mock_pool.acquire.return_value.__aenter__.return_value = mock_conn
    
    # Mock transaction as async context manager
    mock_transaction = MagicMock()
    mock_transaction.__aenter__ = AsyncMock(return_value=None)
    mock_transaction.__aexit__ = AsyncMock(return_value=None)
    mock_conn.transaction = MagicMock(return_value=mock_transaction)
    
    # Mock return values for DB queries
    # 1. First fetchrow (insert into stats): return new totals
    # Simulate gaining 50 XP, total 50, level 1 (no level up as threshold for lvl 2 is 100)
    mock_conn.fetchrow.return_value = {
        "user_id": user_id,
        "total_xp": 50,
        "current_level": 1,
        "last_updated_at": datetime.now()
    }
    
    # Mock sockets
    with patch("app.domain.xp.service.get_pool", new_callable=AsyncMock) as mock_get_pool:
        mock_get_pool.return_value = mock_pool
        with patch("app.domain.xp.sockets.emit_xp_gained", new_callable=AsyncMock) as mock_emit_xp:
             with patch("app.domain.xp.sockets.emit_level_up", new_callable=AsyncMock) as mock_emit_levelup:
                
                await service.award_xp(user_id, action)
                
                # Check emit_xp_gained called
                mock_emit_xp.assert_called_once()
                args, _ = mock_emit_xp.call_args
                assert args[0] == user_id
                assert args[3] == 50 # total_xp
                
                # Check level up NOT called
                mock_emit_levelup.assert_not_called()

@pytest.mark.asyncio
async def test_award_xp_emits_level_up():
    service = XPService()
    user_id = str(uuid4())
    action = XPAction.MEETUP_HOST # Big XP

    # Mock DB interaction
    mock_pool = MagicMock()
    mock_conn = AsyncMock()
    mock_pool.acquire.return_value.__aenter__.return_value = mock_conn
    
    mock_transaction = MagicMock()
    mock_transaction.__aenter__ = AsyncMock(return_value=None)
    mock_transaction.__aexit__ = AsyncMock(return_value=None)
    mock_conn.transaction = MagicMock(return_value=mock_transaction)
    
    # Simulate Level Up
    mock_conn.fetchrow.return_value = {
        "user_id": user_id,
        "total_xp": 500,
        "current_level": 1,
        "last_updated_at": datetime.now()
    }
    
    # Mock sockets
    with patch("app.domain.xp.service.get_pool", new_callable=AsyncMock) as mock_get_pool:
        mock_get_pool.return_value = mock_pool
        with patch("app.domain.xp.sockets.emit_xp_gained", new_callable=AsyncMock) as mock_emit_xp:
             with patch("app.domain.xp.sockets.emit_level_up", new_callable=AsyncMock) as mock_emit_levelup:
                
                await service.award_xp(user_id, action)
                
                # Check both events called
                mock_emit_xp.assert_called_once()
                mock_emit_levelup.assert_called_once()
                
                # Verify Level Up args
                args, _ = mock_emit_levelup.call_args
                assert args[0] == user_id
                assert args[1] == 3 # Calculated level for 500 XP
