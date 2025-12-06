# S5-03: Security Unit & E2E Tests

> Status: ⚠️ **Partial** — Unit tests exist, security-specific tests needed

## Goals

- Add automated tests that verify access control
- Test rate limiting behavior
- Verify input validation prevents common attacks
- Smoke test for XSS/CSRF protections

## Current Test Infrastructure

| Type | Location | Framework | Status |
|------|----------|-----------|--------|
| Backend Unit | `backend/tests/unit/` | pytest | ✅ Extensive |
| Backend Integration | `backend/tests/integration/` | pytest | ✅ |
| Frontend Unit | `frontend/__tests__/` | Vitest | ✅ |
| E2E | `frontend/e2e/` | Playwright | ✅ |

## Security Tests to Add

### 1. Authentication Tests

Location: `backend/tests/unit/test_auth_security.py`

```python
"""Security tests for authentication flows."""
import pytest
from uuid import uuid4

from app.domain.identity import sessions, service
from app.domain.identity.policy import IdentityPolicyError


@pytest.mark.asyncio
async def test_refresh_token_rotation_invalidates_old_token(fake_redis, fake_pool):
    """Verify that using a rotated refresh token fails."""
    user = make_test_user()
    
    # Issue initial tokens
    tokens = await sessions.issue_session_tokens(
        user, ip="127.0.0.1", user_agent="test", fingerprint="fp1"
    )
    
    # Refresh once (rotates the token)
    new_tokens = await sessions.refresh_session(
        user,
        session_id=tokens.session_id,
        refresh_token=tokens.refresh_token,
        ip="127.0.0.1",
        user_agent="test",
        fingerprint="fp1",
    )
    
    # Attempt to use the OLD refresh token
    with pytest.raises(IdentityPolicyError) as exc:
        await sessions.refresh_session(
            user,
            session_id=tokens.session_id,
            refresh_token=tokens.refresh_token,  # OLD token
            ip="127.0.0.1",
            user_agent="test",
            fingerprint="fp1",
        )
    
    assert exc.value.reason in ("refresh_invalid", "refresh_reuse")


@pytest.mark.asyncio
async def test_refresh_token_reuse_revokes_all_sessions(fake_redis, fake_pool):
    """Verify that token reuse triggers session revocation."""
    user = make_test_user()
    
    tokens = await sessions.issue_session_tokens(
        user, ip="127.0.0.1", user_agent="test", fingerprint="fp1"
    )
    
    # Simulate token theft: attacker uses token
    await sessions.refresh_session(
        user,
        session_id=tokens.session_id,
        refresh_token=tokens.refresh_token,
        ip="attacker-ip",
        user_agent="attacker",
        fingerprint="fp1",
    )
    
    # Legitimate user tries to use same token (reuse detection)
    with pytest.raises(IdentityPolicyError) as exc:
        await sessions.refresh_session(
            user,
            session_id=tokens.session_id,
            refresh_token=tokens.refresh_token,
            ip="127.0.0.1",
            user_agent="test",
            fingerprint="fp1",
        )
    
    assert exc.value.reason == "refresh_reuse"
    
    # Verify all sessions are revoked
    session_list = await sessions.list_sessions(str(user.id))
    assert all(s[0].revoked for s in session_list)


@pytest.mark.asyncio
async def test_revoked_access_token_rejected(fake_redis, fake_pool):
    """Verify that revoked sessions cannot authenticate."""
    user = make_test_user()
    
    tokens = await sessions.issue_session_tokens(
        user, ip="127.0.0.1", user_agent="test"
    )
    
    # Revoke the session
    await sessions.revoke_session(str(user.id), tokens.session_id)
    
    # Attempt to refresh should fail
    with pytest.raises(IdentityPolicyError) as exc:
        await sessions.refresh_session(
            user,
            session_id=tokens.session_id,
            refresh_token=tokens.refresh_token,
            ip="127.0.0.1",
            user_agent="test",
        )
    
    assert "revoked" in exc.value.reason or "invalid" in exc.value.reason


@pytest.mark.asyncio
async def test_fingerprint_mismatch_rejected(fake_redis, fake_pool):
    """Verify that mismatched fingerprint fails refresh."""
    user = make_test_user()
    
    tokens = await sessions.issue_session_tokens(
        user, ip="127.0.0.1", user_agent="test", fingerprint="legitimate-device"
    )
    
    # Attempt refresh with different fingerprint
    with pytest.raises(IdentityPolicyError):
        await sessions.refresh_session(
            user,
            session_id=tokens.session_id,
            refresh_token=tokens.refresh_token,
            ip="127.0.0.1",
            user_agent="test",
            fingerprint="stolen-token-different-device",
        )
```

### 2. Authorization Tests

Location: `backend/tests/unit/test_authorization_security.py`

```python
"""Security tests for authorization (user cannot access other users' data)."""
import pytest
from uuid import uuid4

from app.domain.identity import service as identity_service
from app.domain.profile import service as profile_service


@pytest.mark.asyncio
async def test_user_cannot_read_other_users_sessions(fake_pool):
    """Verify user A cannot list user B's sessions."""
    user_a = make_test_user(uuid4())
    user_b = make_test_user(uuid4())
    
    # User A's sessions
    sessions_a = await sessions.list_sessions(str(user_a.id))
    
    # Attempt to access User B's sessions from User A's context should return empty
    # (assuming proper filtering in service layer)
    sessions_b_from_a = await sessions.list_sessions(str(user_b.id))
    
    # This should be empty or raise if accessed improperly
    # The key is that the API layer validates user_id matches authenticated user


@pytest.mark.asyncio
async def test_user_cannot_modify_other_users_profile(fake_pool):
    """Verify user A cannot update user B's profile."""
    user_a_id = uuid4()
    user_b_id = uuid4()
    
    # This test verifies the service layer checks ownership
    # The actual authorization should happen at the API layer via get_current_user
    # But we verify the service doesn't allow cross-user modifications


@pytest.mark.asyncio
@pytest.mark.parametrize("endpoint,method", [
    ("/api/security/sessions", "GET"),
    ("/api/account/privacy", "GET"),
    ("/api/account/privacy", "PATCH"),
    ("/api/account/export", "POST"),
])
async def test_protected_endpoints_require_auth(client, endpoint, method):
    """Verify protected endpoints return 401 without auth."""
    response = await client.request(method, endpoint)
    assert response.status_code == 401
```

### 3. Rate Limiting Tests

Location: `backend/tests/unit/test_rate_limit_security.py`

```python
"""Security tests for rate limiting."""
import pytest
import asyncio

from app.infra.rate_limit import allow
from app.domain.identity.policy import enforce_login_rate, IdentityRateLimitExceeded


@pytest.mark.asyncio
async def test_login_rate_limit_triggers(fake_redis):
    """Verify login rate limit kicks in after threshold."""
    email = "attacker@example.com"
    
    # Make many rapid login attempts
    for i in range(10):
        try:
            await enforce_login_rate(email)
        except IdentityRateLimitExceeded:
            # Expected after threshold
            assert i >= 5, "Rate limit triggered too early"
            return
    
    pytest.fail("Rate limit should have triggered")


@pytest.mark.asyncio
async def test_rate_limit_per_ip_isolation(fake_redis):
    """Verify rate limits are isolated per IP."""
    # IP A hits limit
    for _ in range(100):
        await allow("test:ip", "192.168.1.1", limit=50, window_seconds=60)
    
    # IP B should still be allowed
    result = await allow("test:ip", "192.168.1.2", limit=50, window_seconds=60)
    assert result is True


@pytest.mark.asyncio
async def test_burst_traffic_blocked(fake_redis):
    """Simulate burst traffic and verify blocking."""
    ip = "attacker-ip"
    blocked_count = 0
    
    # Simulate 200 requests in rapid succession
    tasks = [allow("api:ip", ip, limit=100, window_seconds=60) for _ in range(200)]
    results = await asyncio.gather(*tasks)
    
    blocked_count = sum(1 for r in results if not r)
    assert blocked_count >= 100, f"Expected ~100 blocked, got {blocked_count}"
```

### 4. Input Validation Tests

Location: `backend/tests/unit/test_input_validation_security.py`

```python
"""Security tests for input validation."""
import pytest
from fastapi.testclient import TestClient


@pytest.mark.parametrize("payload,expected_status", [
    # SQL injection attempts
    ({"email": "'; DROP TABLE users;--", "password": "test"}, 422),
    ({"email": "test@example.com", "password": "' OR '1'='1"}, 422),
    
    # XSS attempts
    ({"email": "<script>alert('xss')</script>@test.com", "password": "test"}, 422),
    
    # Extremely long inputs
    ({"email": "a" * 10000 + "@test.com", "password": "test"}, 422),
    ({"email": "test@test.com", "password": "a" * 10000}, 422),
    
    # Null bytes
    ({"email": "test\x00@example.com", "password": "test"}, 422),
    
    # Unicode exploits
    ({"email": "test@example.com\u0000admin", "password": "test"}, 422),
])
def test_login_input_validation(client: TestClient, payload, expected_status):
    """Verify malicious inputs are rejected, not causing 500."""
    response = client.post("/api/auth/login", json=payload)
    assert response.status_code == expected_status
    assert response.status_code != 500, "Should not cause server error"


@pytest.mark.parametrize("handle", [
    "admin",
    "root",
    "system",
    "../../../etc/passwd",
    "<script>alert(1)</script>",
    "user\x00admin",
])
def test_reserved_handles_rejected(client: TestClient, handle):
    """Verify reserved/malicious handles are rejected."""
    response = client.post("/api/auth/register", json={
        "email": "test@university.edu",
        "password": "ValidP@ss123",
        "handle": handle,
        "campus_id": "..."
    })
    # Should be 400/422, not 500 or success
    assert response.status_code in (400, 422)


def test_json_depth_limit(client: TestClient):
    """Verify deeply nested JSON is rejected."""
    # Create deeply nested object
    payload = {"level": 0}
    current = payload
    for i in range(100):
        current["nested"] = {"level": i}
        current = current["nested"]
    
    response = client.post("/api/some-endpoint", json=payload)
    assert response.status_code in (400, 422, 413)
```

### 5. XSS/CSRF Smoke Tests

Location: `frontend/e2e/security.spec.ts`

```typescript
import { test, expect } from '@playwright/test';

test.describe('XSS Prevention', () => {
  test('renders user content safely', async ({ page }) => {
    // Login as test user with XSS payload in display name
    await page.goto('/profile/setup');
    
    // Set display name with XSS attempt
    await page.fill('[name="displayName"]', '<script>alert("xss")</script>');
    await page.click('button[type="submit"]');
    
    // Navigate to where name is displayed
    await page.goto('/profile');
    
    // Verify script tag is escaped, not executed
    const content = await page.content();
    expect(content).not.toContain('<script>alert("xss")</script>');
    expect(content).toContain('&lt;script&gt;'); // Escaped
    
    // Verify no alert dialog appeared
    const dialogs: string[] = [];
    page.on('dialog', dialog => dialogs.push(dialog.message()));
    await page.waitForTimeout(1000);
    expect(dialogs).toHaveLength(0);
  });

  test('sanitizes message content', async ({ page }) => {
    await loginAs(page, 'user1');
    await page.goto('/chat/room/test');
    
    // Send message with XSS payload
    await page.fill('[name="message"]', '<img src=x onerror="alert(1)">');
    await page.click('button[type="submit"]');
    
    // Verify payload is sanitized
    const messageContent = await page.textContent('.message-content');
    expect(messageContent).not.toContain('onerror');
  });
});

test.describe('CSRF Protection', () => {
  test('state-changing requests require valid origin', async ({ request }) => {
    // Attempt request without proper origin
    const response = await request.post('/api/account/delete', {
      headers: {
        'Origin': 'https://evil-site.com',
        'Cookie': 'session=valid-session-cookie',
      },
      data: { confirm: true },
    });
    
    // Should be rejected due to CORS
    expect(response.status()).toBe(403);
  });
});
```

## Test Configuration

### pytest markers

Add to `backend/pyproject.toml`:
```toml
[tool.pytest.ini_options]
markers = [
    "security: security-related tests",
    "slow: tests that take > 1s",
]
```

### Running security tests

```bash
# Run all security tests
pytest -m security -v

# Run with coverage
pytest -m security --cov=app --cov-report=html

# Run in CI
pytest -m security --tb=short --junitxml=security-results.xml
```

## Action Items

1. [ ] Create `test_auth_security.py` with token rotation tests
2. [ ] Create `test_authorization_security.py` with cross-user tests
3. [ ] Create `test_rate_limit_security.py` with burst tests
4. [ ] Create `test_input_validation_security.py` with fuzzing
5. [ ] Add `security.spec.ts` E2E tests
6. [ ] Add security tests to CI required checks
7. [ ] Target 80% coverage on auth/authz code paths
