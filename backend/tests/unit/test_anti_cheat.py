import pytest
from unittest.mock import AsyncMock, MagicMock, patch
from uuid import uuid4
from datetime import datetime

from app.domain.xp.service import XPService
from app.domain.xp.models import XPAction
from app.domain.meetups.service import MeetupService
from app.domain.meetups import schemas
from app.infra.auth import AuthenticatedUser

@pytest.mark.asyncio
async def test_xp_diminishing_returns(fake_redis):
    service = XPService()
    user_id = str(uuid4())
    target_id = str(uuid4())
    action = XPAction.MEETUP_JOIN
    base_amount = 50

    # Mock _is_user_verified to return True (Standard Case)
    with patch.object(service, '_is_user_verified', return_value=True):
        # 1st Interaction: 100%
        amount1 = await service._apply_diminishing_returns(user_id, target_id, action, base_amount)
        assert amount1 == 50

        # 2nd Interaction: 50%
        amount2 = await service._apply_diminishing_returns(user_id, target_id, action, base_amount)
        assert amount2 == 25

        # 3rd Interaction: 0%
        amount3 = await service._apply_diminishing_returns(user_id, target_id, action, base_amount)
        assert amount3 == 0

@pytest.mark.asyncio
async def test_xp_sybil_dampening(fake_redis):
    service = XPService()
    user_id = str(uuid4())
    unverified_target_id = str(uuid4())
    action = XPAction.MEETUP_JOIN
    base_amount = 50

    # Mock _is_user_verified to return False (Unverified Case)
    with patch.object(service, '_is_user_verified', return_value=False):
        # 1st Interaction: 50% (Halved due to unverified)
        amount1 = await service._apply_diminishing_returns(user_id, unverified_target_id, action, base_amount)
        assert amount1 == 25  # 50 // 2

        # 2nd Interaction: 25% (Halved again due to diminishing returns)
        amount2 = await service._apply_diminishing_returns(user_id, unverified_target_id, action, base_amount)
        assert amount2 == 12  # 25 // 2

        # 3rd Interaction: 0%
        amount3 = await service._apply_diminishing_returns(user_id, unverified_target_id, action, base_amount)
        assert amount3 == 0

@pytest.mark.asyncio
async def test_meetup_attendance_no_self_xp():
    service = MeetupService()
    
    host_id = uuid4()
    meetup_id = uuid4()
    participant_id = uuid4()
    
    auth_user = AuthenticatedUser(
        id=str(host_id),
        campus_id=str(uuid4())
    )
    
    # Payload includes Host ID (attempting self-attendance) and one Participant
    payload = schemas.MeetupAttendanceUpdateRequest(
        user_ids=[host_id, participant_id],
        status="PRESENT"
    )

    # Mock DB Connection
    mock_pool = MagicMock()
    mock_conn = AsyncMock()
    mock_pool.acquire.return_value.__aenter__.return_value = mock_conn
    
    # Mock meetup exist check
    mock_conn.fetchrow.return_value = {"creator_user_id": str(host_id)}
    
    # Mock participant joined check
    # Check is called for each ID in trimmed list. 
    # Logic: "SELECT 1 ... WHERE user_id = $2"
    # We want it to return True for participant_id
    mock_conn.fetchval.side_effect = lambda query, mid, uid: True if str(uid) == str(participant_id) else None

    # Mock XP Service
    with patch("app.domain.xp.service.XPService.award_xp", new_callable=AsyncMock) as mock_award_xp:
        with patch.object(service, '_get_pool', return_value=mock_pool):
            await service.update_attendance(meetup_id, auth_user, payload)
            
            # Should only call award_xp ONCE for participant, NOT for host
            assert mock_award_xp.call_count == 2 # 1 for participant join, 1 for host 'meetup_host' award
            
            # Verify calls
            calls = mock_award_xp.call_args_list
            
            # 1. Participant Join Award
            args, kwargs = calls[0]
            assert args[0] == str(participant_id)
            assert args[1] == XPAction.MEETUP_JOIN
            assert kwargs['metadata']['host_id'] == str(host_id)
            
            # 2. Host Award (Ghost Meetup Check passed)
            args, kwargs = calls[1]
            assert args[0] == str(host_id)
            assert args[1] == XPAction.MEETUP_HOST

