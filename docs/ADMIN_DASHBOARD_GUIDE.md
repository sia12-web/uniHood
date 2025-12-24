# Admin Dashboard Guide

This document explains how to access and use the uniHood Admin Dashboard, including all available features and their capabilities.

## Accessing the Admin Dashboard

### URL
Navigate to: `/admin`

### Authentication Requirements
You must be authenticated with appropriate admin/staff roles. There are two ways to authenticate:

#### Production Mode
- Use a valid JWT token in the `Authorization: Bearer <token>` header
- The token must include the `admin` or `moderator` role in the `roles` claim

#### Development Mode
For local testing, you can use HTTP headers:
```
X-User-Id: your-user-id
X-Campus-Id: your-campus-id
X-User-Roles: admin
```

#### Development Admin Login
There is no default admin account set up in the system for security reasons. The admin panel is restricted to users who have been explicitly granted the admin role in the database.

For development, you can use the test account in `test_login.json`:
- Email: `test@test.com`
- Password: `test123`

Important: Promoting yourself to admin
Even with the credentials above, you will not be able to access the admin panel until that user is granted the admin role in the database.

Run the helper script from the repo root (it also marks the test account as email-verified for local use):
```bash
python promote_admin.py
```

Once complete, log in at `/admin-login`.

---

## Dashboard Overview (`/admin`)

The main dashboard shows real-time system statistics:

| Metric | Description |
|--------|-------------|
| **System Health** | Overall platform health score (0-100%) based on escalations and pending appeals |
| **Resolved Today** | Number of moderation cases resolved in the past 24 hours |
| **Pending Reviews** | Open moderation cases + pending contact messages requiring attention |
| **Recent Audit Logs** | Latest administrative actions taken on the platform |

---

## Admin Features

### 1. Moderation (`/admin/mod/triage`)

**Purpose**: Review and act on user reports for harassment, abuse, spam, and NSFW content.

**Features**:
- **Triage Queue**: Cases organized by severity (sev1 = critical, sev4 = low priority)
- **Cases List** (`/admin/mod/cases`): Searchable table with filters
- **Case Details**: View reporter info, evidence, and take action

**Actions Available**:
| Action | Description |
|--------|-------------|
| Assign | Assign case to a specific moderator |
| Escalate | Move to higher severity/priority |
| Dismiss | Close case as no action needed |
| Apply Enforcement | Take action (warn, restrict, ban, etc.) |

**Filters**:
- Status (open, pending, resolved, closed)
- Severity (1-4)
- Subject type (user, post, comment, message, group, event)
- Reason (abuse, harassment, spam, nsfw, other)
- Date range
- Campus

---

### 2. Contact Messages (`/admin/contact`)

**Purpose**: View and respond to user support requests submitted via the Contact page.

**Features**:
- View all contact form submissions
- Filter by status (pending, in_progress, resolved, closed)
- Filter by category (general, bug, feature, account, abuse, other)
- Update message status
- Add admin notes
- Reply via email directly

**Status Flow**:
```
pending → in_progress → resolved/closed
```

---

### 3. Verification Queue (`/admin/verification`)

**Purpose**: Review and approve/reject student identity verification requests.

**Features**:
- View pending verification submissions
- See uploaded documents
- Approve or reject with notes
- Auto-updates user trust levels

**Actions**:
- **Approve**: Marks user as verified, increases trust level
- **Reject**: Notifies user, logs to audit

---

### 4. Feature Flags (`/admin/flags`)

**Purpose**: Control feature rollouts and A/B testing across the platform.

**Features**:
- Create/edit/delete feature flags
- Set default enabled/disabled state
- Configure percentage rollouts
- Create overrides for specific users or campuses
- Evaluate flags for specific users

**Flag Types**:
| Type | Description |
|------|-------------|
| `boolean` | Simple on/off toggle |
| `percentage` | Gradual rollout (0-100%) |
| `variant` | A/B testing with multiple variants |
| `json` | Complex configuration payloads |

**Override Priority** (highest to lowest):
1. User-specific override
2. Campus-specific override
3. Global default

---

### 5. Roles & Permissions (`/admin/rbac`)

**Purpose**: Manage role-based access control for staff members.

**Features**:
- Create custom roles
- Attach/detach permissions to roles
- Grant roles to users (campus-scoped or global)
- Revoke user roles
- Check permission status

**Built-in Permissions**:
| Permission | Description |
|------------|-------------|
| `identity.rbac.grant` | Can assign roles to users |
| `identity.rbac.revoke` | Can remove roles from users |
| `mod.case.view` | Can view moderation cases |
| `mod.case.action` | Can take action on cases |
| `mod.audit.view` | Can view audit logs |
| `flags.manage` | Can manage feature flags |

---

### 6. Policy & Consent (`/admin/consent`)

**Purpose**: Manage legal policies and track user consent.

**Features**:
- View all policy documents (Privacy Policy, Terms of Service, etc.)
- Track consent acceptance rates
- See which users have missing consents
- Record consent on behalf of users (admin action)

---

### 7. Audit Logs (`/admin/mod/audit`)

**Purpose**: Complete audit trail of all administrative actions.

**Logged Actions**:
- Role grants/revokes
- Flag changes
- Moderation decisions
- Verification approvals/rejections
- Policy updates
- User restrictions

**Fields**:
| Field | Description |
|-------|-------------|
| Action | Type of action taken |
| Actor | Who performed the action |
| Target | What was affected |
| Timestamp | When it occurred |
| Metadata | Additional context |

---

## Viewing Reported Users

### Method 1: Triage Queue
1. Go to `/admin/mod/triage`
2. Cases are automatically organized by severity
3. Click on a case to see:
   - Who was reported
   - Who reported them
   - Reason and evidence
   - Action history

### Method 2: Cases List (Advanced)
1. Go to `/admin/mod/cases`
2. Use filters to find specific reports:
   - Set `subject_type` to `user`
   - Filter by `status: open` for unresolved
   - Filter by `reason: harassment` for specific types
3. Click case ID for full details

### Method 3: User Search
1. Go to `/admin/mod/users` (if implemented)
2. Search by user ID or handle
3. View their moderation history

---

## Quick Reference: Key URLs

| Page | URL | Description |
|------|-----|-------------|
| Dashboard | `/admin` | Main overview |
| Moderation Triage | `/admin/mod/triage` | Report queue |
| All Cases | `/admin/mod/cases` | Searchable case list |
| Contact Messages | `/admin/contact` | Support requests |
| Verification | `/admin/verification` | ID verification queue |
| Feature Flags | `/admin/flags` | Flag management |
| Permissions | `/admin/rbac` | Role/permission config |
| Consent | `/admin/consent` | Policy management |
| Audit Logs | `/admin/mod/audit` | Action history |

---

## Backend API Endpoints

### Moderation
- `GET /api/mod/v1/admin/dashboard/kpis` - Dashboard metrics
- `GET /api/mod/v1/admin/cases` - List cases with filters
- `GET /api/mod/v1/admin/cases/{id}` - Case details
- `POST /api/mod/v1/admin/cases/batch_action` - Bulk actions
- `GET /api/mod/v1/admin/audit` - Audit logs

### Contact
- `POST /contact` - Submit contact form (public)
- `GET /contact/admin` - List messages (admin)
- `PATCH /contact/admin/{id}` - Update message status

### Feature Flags
- `GET /flags` - List all flags
- `POST /flags` - Create/update flag
- `DELETE /flags/{key}` - Delete flag
- `GET /flags/overrides` - List overrides
- `POST /flags/overrides` - Create override

### RBAC
- `GET /rbac/roles` - List roles
- `POST /rbac/roles` - Create role
- `POST /rbac/roles/{id}/permissions` - Attach permission
- `DELETE /rbac/roles/{id}/permissions/{perm}` - Detach permission
- `POST /rbac/users/{id}/roles` - Grant role
- `DELETE /rbac/users/{id}/roles/{role}` - Revoke role

---

## Best Practices

1. **Always use the triage queue** for new reports - it prioritizes by severity
2. **Add notes** when taking moderation actions for audit purposes
3. **Use batch actions** for handling multiple similar cases
4. **Check audit logs** before making significant permission changes
5. **Test feature flags** with evaluation tool before enabling globally
6. **Follow up on contact messages** within 24 hours
