import pytest
from uuid import uuid4
from unittest.mock import AsyncMock, MagicMock, patch

from app.domain.clubs.service import ClubService
from app.domain.clubs.schemas import ClubCreateRequest
from app.domain.xp.models import UserXPStats

@pytest.fixture
def club_service():
    return ClubService()

@pytest.mark.asyncio
async def test_create_club_success(club_service):
    user_id = uuid4()
    campus_id = uuid4()
    data = ClubCreateRequest(name="Chess Club", description="For chess lovers", campus_id=campus_id)
    
    # Mock XP Service
    with patch("app.domain.clubs.service.XPService") as MockXPService:
        mock_xp = MockXPService.return_value
        # Level 6
        mock_xp.get_user_stats = AsyncMock(return_value=UserXPStats(
            user_id=user_id, total_xp=15000, current_level=6, last_updated_at=None
        ))
        
        # Mock DB
        with patch("app.domain.clubs.service.get_pool") as mock_get_pool:
            mock_pool = MagicMock()
            mock_conn = AsyncMock()
            mock_get_pool.return_value = mock_pool
            mock_pool.acquire.return_value.__aenter__.return_value = mock_conn
            
            # Mock INSERT clubs RETURNING ...
            mock_conn.fetchrow.side_effect = [
                {
                    "id": uuid4(), 
                    "name": "Chess Club", 
                    "description": "For chess lovers", 
                    "owner_id": user_id, 
                    "campus_id": campus_id, 
                    "created_at": None, 
                    "updated_at": None
                }
            ]
            
            club = await club_service.create_club(user_id, data)
            
            assert club.name == "Chess Club"
            assert club.owner_id == user_id
            
            # Verify insert calls
            assert mock_conn.fetchrow.called
            assert mock_conn.execute.called # For adding member

@pytest.mark.asyncio
async def test_create_club_permission_denied(club_service):
    user_id = uuid4()
    data = ClubCreateRequest(name="Test Club")
    
    with patch("app.domain.clubs.service.XPService") as MockXPService:
        mock_xp = MockXPService.return_value
        # Level 5 (Too low)
        mock_xp.get_user_stats = AsyncMock(return_value=UserXPStats(
            user_id=user_id, total_xp=5000, current_level=5, last_updated_at=None
        ))
        
        from fastapi import HTTPException
        with pytest.raises(HTTPException) as exc:
            await club_service.create_club(user_id, data)
        
        assert exc.value.status_code == 403

