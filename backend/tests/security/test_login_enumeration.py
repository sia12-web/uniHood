import pytest
from unittest.mock import AsyncMock, MagicMock, patch
from app.domain.identity import service

@pytest.mark.asyncio
async def test_login_user_not_found_returns_invalid_credentials():
    # Mock the pool and connection
    mock_pool = MagicMock() # Pool itself is not async, its methods are
    mock_conn = AsyncMock()
    
    # acquire() returns an async context manager
    mock_acquire_ctx = AsyncMock()
    mock_acquire_ctx.__aenter__.return_value = mock_conn
    mock_pool.acquire.return_value = mock_acquire_ctx
    
    # Mock fetchrow to return None (user not found)
    mock_conn.fetchrow.return_value = None
    
    # get_pool is an async function that returns the pool
    mock_get_pool = AsyncMock(return_value=mock_pool)
    
    with patch("app.domain.identity.service.get_pool", mock_get_pool):
        with patch("app.domain.identity.policy.enforce_login_rate", new_callable=AsyncMock):
            with pytest.raises(service.LoginFailed) as excinfo:
                await service.login(
                    MagicMock(email="unknown@example.com", password="password"),
                    ip="127.0.0.1",
                    user_agent="test"
                )
            
            # Verify the error reason is "invalid_credentials", NOT "not_found"
            assert excinfo.value.reason == "invalid_credentials"

@pytest.mark.asyncio
async def test_login_wrong_password_returns_invalid_credentials():
    # Mock the pool and connection
    mock_pool = MagicMock()
    mock_conn = AsyncMock()
    
    mock_acquire_ctx = AsyncMock()
    mock_acquire_ctx.__aenter__.return_value = mock_conn
    mock_pool.acquire.return_value = mock_acquire_ctx
    
    # Mock fetchrow to return a user record
    mock_user_record = {
        "id": "123",
        "email": "test@example.com",
        "password_hash": "hash",
        "email_verified": True
    }
    mock_conn.fetchrow.return_value = mock_user_record
    
    # Mock User.from_record
    mock_user = MagicMock()
    mock_user.password_hash = "hash"
    mock_user.email_verified = True
    mock_user.id = "123"
    
    mock_get_pool = AsyncMock(return_value=mock_pool)
    
    with patch("app.domain.identity.service.get_pool", mock_get_pool):
        with patch("app.domain.identity.policy.enforce_login_rate", new_callable=AsyncMock):
            with patch("app.domain.identity.models.User.from_record", return_value=mock_user):
                # Fix: Patch the entire _PASSWORD_HASHER object, not just the verify method
                # because verify is read-only on the real object.
                mock_hasher = MagicMock()
                from argon2 import exceptions as argon_exc
                mock_hasher.verify.side_effect = argon_exc.VerifyMismatchError("mismatch")
                
                with patch("app.domain.identity.service._PASSWORD_HASHER", mock_hasher):
                    with pytest.raises(service.LoginFailed) as excinfo:
                        await service.login(
                            MagicMock(email="test@example.com", password="wrong"),
                            ip="127.0.0.1",
                            user_agent="test"
                        )
                    assert excinfo.value.reason == "invalid_credentials"