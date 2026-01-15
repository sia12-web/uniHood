import pytest
from unittest.mock import AsyncMock, MagicMock, patch
from app.domain.identity import recovery

@pytest.mark.asyncio
async def test_request_password_reset_success():
    with patch("app.domain.identity.recovery.get_pool", new_callable=AsyncMock) as mock_get_pool, \
         patch("app.domain.identity.recovery.mailer.send_password_reset", new_callable=AsyncMock) as mock_send, \
         patch("app.domain.identity.policy.enforce_pwreset_request_rate", new_callable=AsyncMock):
        
        mock_pool = MagicMock()
        mock_conn = MagicMock()
        mock_conn.fetchrow = AsyncMock()
        mock_conn.execute = AsyncMock()
        mock_get_pool.return_value = mock_pool
        
        # Mock pool.acquire() to return an async context manager
        mock_ctx = MagicMock()
        mock_ctx.__aenter__.return_value = mock_conn
        mock_ctx.__aexit__.return_value = None
        mock_pool.acquire.return_value = mock_ctx
        
        # Mock conn.transaction() to return an async context manager
        mock_tx = MagicMock()
        mock_tx.__aenter__.return_value = None
        mock_tx.__aexit__.return_value = None
        mock_conn.transaction.return_value = mock_tx
        
        # Mock user found
        mock_conn.fetchrow.return_value = {"id": "user-uuid", "email": "test@example.com"}
        
        await recovery.request_password_reset("test@example.com")
        
        assert mock_conn.execute.called
        assert mock_send.called

@pytest.mark.asyncio
async def test_request_username_recovery_success():
    with patch("app.domain.identity.recovery.get_pool", new_callable=AsyncMock) as mock_get_pool, \
         patch("app.domain.identity.recovery.mailer.send_username_reminder", new_callable=AsyncMock) as mock_send, \
         patch("app.domain.identity.policy.enforce_pwreset_request_rate", new_callable=AsyncMock):
        
        mock_pool = MagicMock()
        mock_conn = MagicMock()
        mock_conn.fetchrow = AsyncMock()
        mock_conn.execute = AsyncMock()
        mock_get_pool.return_value = mock_pool
        
        mock_ctx = MagicMock()
        mock_ctx.__aenter__.return_value = mock_conn
        mock_ctx.__aexit__.return_value = None
        mock_pool.acquire.return_value = mock_ctx
        
        # Mock user found
        mock_conn.fetchrow.return_value = {"id": "user-uuid", "email": "test@example.com", "handle": "testhandle"}
        
        await recovery.request_username_recovery("test@example.com")
        
        assert mock_send.called
        args, _ = mock_send.call_args
        assert args[0] == "test@example.com"
        assert args[1] == "testhandle"

@pytest.mark.asyncio
async def test_consume_password_reset_success():
    with patch("app.domain.identity.recovery.get_pool", new_callable=AsyncMock) as mock_get_pool, \
         patch("app.domain.identity.policy.enforce_pwreset_consume_rate", new_callable=AsyncMock), \
         patch("app.domain.identity.sessions.revoke_all_sessions", new_callable=AsyncMock):
        
        mock_pool = MagicMock()
        mock_conn = MagicMock()
        mock_conn.fetchrow = AsyncMock()
        mock_conn.execute = AsyncMock()
        mock_get_pool.return_value = mock_pool
        
        mock_ctx = MagicMock()
        mock_ctx.__aenter__.return_value = mock_conn
        mock_ctx.__aexit__.return_value = None
        mock_pool.acquire.return_value = mock_ctx
        
        # Mock conn.transaction() to return an async context manager
        mock_tx = MagicMock()
        mock_tx.__aenter__.return_value = None
        mock_tx.__aexit__.return_value = None
        mock_conn.transaction.return_value = mock_tx
        
        # Mock valid token
        from datetime import datetime, timedelta, timezone
        future = datetime.now(timezone.utc) + timedelta(minutes=10)
        mock_conn.fetchrow.return_value = {
            "id": "reset-uuid",
            "user_id": "user-uuid",
            "token": "valid-token",
            "expires_at": future,
            "used_at": None
        }
        
        await recovery.consume_password_reset("valid-token", "newpassword123", ip="127.0.0.1")
        
        assert mock_conn.execute.call_count == 2 # Update user password, update reset token used_at
