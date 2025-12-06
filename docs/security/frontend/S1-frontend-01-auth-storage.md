# S1-frontend-01: Auth Token Storage

> **Severity**: S1 (Critical)  
> **Domain**: Frontend  
> **Status**: Specification

## Overview

Secure storage and handling of authentication tokens in the browser.

## Requirements

### 1. Token Storage Strategy

| Token Type | Storage | Rationale |
|------------|---------|-----------|
| Access Token | Memory only | Short-lived, XSS risk if persisted |
| Refresh Token | HttpOnly cookie | Immune to XSS, server manages |

### 2. Access Token Handling

- Store in memory (React state/context)
- Never persist to localStorage/sessionStorage
- Include in `Authorization: Bearer` header
- Clear on logout or tab close

```typescript
// ✅ GOOD: Memory storage
const [accessToken, setAccessToken] = useState<string | null>(null);

// ❌ BAD: localStorage
localStorage.setItem("access_token", token);
```

### 3. Refresh Token Handling

- Stored in HttpOnly, Secure, SameSite=Lax cookie
- Automatically sent with requests to `/auth/refresh`
- Cannot be accessed by JavaScript
- Server handles rotation

### 4. Token Refresh Flow

```
1. Access token expires (or 401 response)
2. Frontend calls POST /auth/refresh (cookie sent automatically)
3. Backend validates refresh token, issues new access token
4. Frontend stores new access token in memory
5. Retry original request
```

### 5. Logout Flow

```
1. Call POST /auth/logout
2. Backend invalidates refresh token
3. Backend clears refresh cookie
4. Frontend clears access token from memory
5. Redirect to login page
```

### 6. XSS Mitigation

- Access token in memory is lost on XSS (attacker can't exfiltrate)
- Refresh token in HttpOnly cookie is inaccessible to scripts
- Even if attacker has session, they can't persist access

### 7. CSRF Mitigation

- SameSite=Lax cookie prevents cross-origin requests with cookie
- State-changing requests require access token in header
- Double-submit cookie pattern for extra protection (optional)

## Implementation Checklist

- [ ] AuthContext with memory-only access token
- [ ] Automatic token refresh on 401
- [ ] Logout clears all auth state
- [ ] No tokens in localStorage/sessionStorage
- [ ] Secure cookie configuration on backend

## Anti-Patterns

```typescript
// ❌ BAD: Storing tokens in localStorage
localStorage.setItem("token", response.access_token);

// ❌ BAD: Exposing token in URL
window.location.href = `/dashboard?token=${token}`;

// ❌ BAD: Logging tokens
console.log("Token:", accessToken);
```

## Related Specs

- [S1-backend-01-authentication.md](../backend/S1-backend-01-authentication.md)
- [S2-frontend-01-xss-and-sanitization.md](./S2-frontend-01-xss-and-sanitization.md)
