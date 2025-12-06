# S2-backend-02: Authorization Rules

> **Severity**: S2 (High)  
> **Domain**: Backend  
> **Status**: Specification

## Overview

Authorization policies and access control mechanisms.

## Requirements

### 1. Authentication vs Authorization

- **Authentication**: Verify identity (who are you?)
- **Authorization**: Verify permissions (what can you do?)
- Always authenticate before authorizing

### 2. Resource Ownership

- Users can only access/modify their own resources by default
- Always verify `resource.owner_id == current_user.id`
- Never trust client-provided user_id for authorization

```python
# ❌ BAD: Trusting client-provided user_id
@router.delete("/posts/{post_id}")
async def delete_post(post_id: str, user_id: str = Query(...)):
    await delete(post_id)  # No ownership check!

# ✅ GOOD: Using authenticated user
@router.delete("/posts/{post_id}")
async def delete_post(post_id: str, user: AuthenticatedUser = Depends(get_current_user)):
    post = await get_post(post_id)
    if post.author_id != user.id:
        raise HTTPException(403, "Not authorized")
    await delete(post_id)
```

### 3. Role-Based Access Control (RBAC)

| Role | Permissions |
|------|-------------|
| `user` | CRUD own resources, view public resources |
| `moderator` | View reports, manage content, issue warnings |
| `admin` | Full system access, user management |
| `staff` | Access staff tools, view analytics |

### 4. Campus Isolation

- Users can only access resources within their campus
- Cross-campus access requires explicit permission
- Global resources (e.g., system announcements) bypass campus check

### 5. Object-Level Authorization

For each resource type, define:
- Who can **create**
- Who can **read**
- Who can **update**
- Who can **delete**

| Resource | Create | Read | Update | Delete |
|----------|--------|------|--------|--------|
| Post | owner | public/friends | owner | owner/mod |
| Profile | system | privacy settings | owner | owner |
| Message | sender | sender/recipient | none | sender |
| Report | any user | staff | staff | none |

### 6. API Security Headers

- Derive user identity from JWT/session only
- Ignore `X-User-Id` headers from untrusted sources
- Staff endpoints may use impersonation headers with audit

## Implementation Checklist

- [ ] Ownership check middleware/decorator
- [ ] Role verification decorators
- [ ] Campus isolation middleware
- [ ] Permission matrix documentation
- [ ] Authorization audit logging

## Related Specs

- [S1-backend-01-authentication.md](./S1-backend-01-authentication.md)
