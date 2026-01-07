
import pytest
from uuid import uuid4
from unittest.mock import AsyncMock, MagicMock, patch
from datetime import datetime

from app.domain.clubs.service import ClubService
from app.domain.xp.models import XPAction

@pytest.fixture
def club_service():
    return ClubService()

@pytest.mark.asyncio
async def test_join_club_awards_xp(club_service):
    user_id = uuid4()
    club_id = uuid4()
    
    # Mock XP Service
    with patch("app.domain.clubs.service.XPService") as MockXPService:
        mock_xp = MockXPService.return_value
        mock_xp.award_xp = AsyncMock()
        
        # Mock Audit
        with patch("app.domain.identity.audit.log_event", new_callable=AsyncMock) as mock_audit:
            
            # Mock DB
            with patch("app.domain.clubs.service.get_pool") as mock_get_pool:
                mock_pool = MagicMock()
                mock_conn = AsyncMock()
                mock_get_pool.return_value = mock_pool
                mock_pool.acquire.return_value.__aenter__.return_value = mock_conn
                
                # Setup fetchrow return for "INSERT ... RETURNING *"
                mock_conn.fetchrow.return_value = {
                    "club_id": club_id,
                    "user_id": user_id,
                    "role": "member",
                    "joined_at": datetime.now()
                }
                
                await club_service.join_club(user_id, club_id)
                
                # Check DB Insert
                assert mock_conn.fetchrow.called
                args, _ = mock_conn.fetchrow.call_args
                assert "INSERT INTO club_members" in args[0]
                
                # Check XP Award
                mock_xp.award_xp.assert_called_once_with(
                    user_id, XPAction.CLUB_JOIN, metadata={"club_id": str(club_id)}
                )
                
                # Check Audit Log
                mock_audit.assert_called_once()
                assert mock_audit.call_args[1]['event'] == "club.join"

@pytest.mark.asyncio
async def test_leave_club_deducts_xp(club_service):
    user_id = uuid4()
    club_id = uuid4()
    
    with patch("app.domain.clubs.service.XPService") as MockXPService:
        mock_xp = MockXPService.return_value
        mock_xp.award_xp = AsyncMock()
        
        with patch("app.domain.identity.audit.log_event", new_callable=AsyncMock) as mock_audit:
            
            with patch("app.domain.clubs.service.get_pool") as mock_get_pool:
                mock_pool = MagicMock()
                mock_conn = AsyncMock()
                mock_get_pool.return_value = mock_pool
                mock_pool.acquire.return_value.__aenter__.return_value = mock_conn
                
                # Setup fetchrow for "SELECT role ..." check
                mock_conn.fetchrow.return_value = {"role": "member"}
                
                await club_service.leave_club(user_id, club_id)
                
                # Check DB Delete
                assert mock_conn.execute.called
                args, _ = mock_conn.execute.call_args
                assert "DELETE FROM club_members" in args[0]
                
                # Check XP Deduction
                mock_xp.award_xp.assert_called_once_with(
                    user_id, XPAction.CLUB_LEAVE, metadata={"club_id": str(club_id)}
                )
