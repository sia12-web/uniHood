# F3-01: Privacy Controls

> Status: ✅ **Partial** — API endpoints exist in `backend/app/api/account.py`, UX pending

## Goals

- Allow users to control discoverability and data visibility
- Implement data export and deletion (GDPR/PIPEDA compliance)
- Define retention policies with user control

## Current Implementation

### Existing Privacy API

Location: `backend/app/api/account.py`

| Endpoint | Method | Status | Description |
|----------|--------|--------|-------------|
| `/account/privacy` | GET | ✅ | Get privacy settings |
| `/account/privacy` | PATCH | ✅ | Update privacy settings |
| `/account/blocked` | GET | ✅ | List blocked users |
| `/account/block` | POST | ✅ | Block a user |
| `/account/unblock` | POST | ✅ | Unblock a user |
| `/account/export` | POST | ✅ | Request data export |
| `/account/export/status` | GET | ✅ | Check export status |
| `/account/delete` | POST | ✅ | Request account deletion |
| `/account/delete/confirm` | POST | ✅ | Confirm deletion |

### Existing Frontend SDK

Location: `frontend/lib/privacy.ts`

```typescript
// Already implemented
export async function getPrivacySettings(): Promise<PrivacySettings>
export async function updatePrivacySettings(settings: Partial<PrivacySettings>): Promise<void>
export async function blockUser(userId: string): Promise<void>
export async function unblockUser(userId: string): Promise<void>
export async function requestDataExport(): Promise<ExportJob>
export async function getExportStatus(): Promise<ExportJob | null>
export async function requestAccountDeletion(): Promise<void>
```

## Feature Specifications

### 1. Profile Discoverability Toggle

**User Story:** As a user, I want to control whether I appear in search and discovery features.

**Settings:**
```typescript
interface DiscoverabilitySettings {
  // Master toggle - if false, user doesn't appear in any discovery
  discoverable: boolean;
  
  // Granular controls (only if discoverable: true)
  showInSearch: boolean;      // Appear in user search
  showInNearby: boolean;      // Appear in proximity/nearby
  showInCampus: boolean;      // Appear in campus directory
  showInMatching: boolean;    // Appear in matching suggestions
}
```

**Backend Implementation:**
```python
# In privacy settings schema
class DiscoverabilitySettings(BaseModel):
    discoverable: bool = True
    show_in_search: bool = True
    show_in_nearby: bool = True
    show_in_campus: bool = True
    show_in_matching: bool = True

# In discovery queries, filter by settings
async def search_users(query: str, requester_id: UUID) -> list[UserSummary]:
    # Only return users with discoverable=True AND show_in_search=True
    return await conn.fetch("""
        SELECT u.* FROM users u
        JOIN user_privacy p ON p.user_id = u.id
        WHERE u.deleted_at IS NULL
          AND (p.settings->>'discoverable')::boolean = true
          AND (p.settings->>'show_in_search')::boolean = true
          AND to_tsvector(u.handle || ' ' || u.display_name) @@ plainto_tsquery($1)
    """, query)
```

### 2. Proximity Granularity Controls

**User Story:** As a user, I want to control how precisely my location is shared.

**Settings:**
```typescript
interface ProximitySettings {
  // Enable/disable proximity features entirely
  proximityEnabled: boolean;
  
  // How precise is the distance shown to others
  distanceGranularity: 'exact' | 'approximate' | 'zone';
  // exact: "150m away"
  // approximate: "within 500m"
  // zone: "on campus" / "nearby"
  
  // Maximum radius for being discoverable
  maxDiscoveryRadius: number; // meters, 0 = unlimited
  
  // Who can see proximity
  proximityVisibleTo: 'everyone' | 'friends' | 'no_one';
}
```

**Backend Implementation:**
```python
def calculate_display_distance(
    actual_distance: float,
    granularity: str
) -> str:
    if granularity == 'exact':
        return f"{int(actual_distance)}m away"
    elif granularity == 'approximate':
        # Round to nearest 500m
        rounded = ceil(actual_distance / 500) * 500
        return f"within {rounded}m"
    else:  # zone
        if actual_distance < 100:
            return "very close"
        elif actual_distance < 500:
            return "nearby"
        elif actual_distance < 2000:
            return "on campus"
        else:
            return "in the area"
```

### 3. Data Export

**User Story:** As a user, I want to download all my data in a portable format.

**Current Status:** Endpoint exists, generation is stub.

**Export Contents:**
```
export_{user_id}_{timestamp}.zip
├── profile.json           # User profile data
├── settings.json          # All settings
├── messages/              # Chat messages (JSON per room)
│   ├── room_xxx.json
│   └── room_yyy.json
├── posts/                 # Community posts
│   └── posts.json
├── events/                # Events created/attended
│   └── events.json
├── connections/           # Friends, blocked users
│   └── connections.json
├── media/                 # Uploaded images
│   ├── avatar.jpg
│   └── gallery/
└── audit_log.json         # Account activity log
```

**Implementation TODO:**
```python
async def generate_export(user_id: UUID) -> str:
    """Generate data export package. Returns download URL."""
    # 1. Gather all user data
    profile = await fetch_profile(user_id)
    messages = await fetch_all_messages(user_id)
    posts = await fetch_all_posts(user_id)
    events = await fetch_all_events(user_id)
    media = await list_user_media(user_id)
    audit = await fetch_audit_log(user_id)
    
    # 2. Create ZIP archive
    with zipfile.ZipFile(export_path, 'w') as zf:
        zf.writestr('profile.json', json.dumps(profile))
        zf.writestr('messages/', serialize_messages(messages))
        # ... etc
    
    # 3. Upload to secure storage with expiring URL
    download_url = await upload_to_storage(export_path, expires_hours=48)
    
    # 4. Notify user
    await send_email(user.email, 'export_ready', download_url=download_url)
    
    return download_url
```

### 4. Account Deletion

**User Story:** As a user, I want to permanently delete my account and all data.

**Deletion Flow:**
```
1. User requests deletion → POST /account/delete
   - Generate confirmation token
   - Send confirmation email
   
2. User confirms → POST /account/delete/confirm
   - Soft delete (deleted_at timestamp)
   - Revoke all sessions
   - Queue hard delete job
   
3. Grace period (14 days)
   - User can cancel during this period
   - Account is "deactivated" but not purged
   
4. Hard delete (automated job)
   - Remove PII
   - Delete messages
   - Delete media
   - Anonymize audit logs
   - Retain minimal metadata for legal
```

**Data Handling:**
```python
async def hard_delete_user(user_id: UUID):
    """Permanently remove user data after grace period."""
    async with pool.acquire() as conn:
        async with conn.transaction():
            # 1. Delete chat messages
            await conn.execute(
                "DELETE FROM messages WHERE sender_id = $1", user_id
            )
            
            # 2. Delete posts
            await conn.execute(
                "DELETE FROM posts WHERE author_id = $1", user_id
            )
            
            # 3. Delete media from storage
            media_keys = await conn.fetch(
                "SELECT storage_key FROM media WHERE user_id = $1", user_id
            )
            for key in media_keys:
                await storage.delete(key['storage_key'])
            await conn.execute(
                "DELETE FROM media WHERE user_id = $1", user_id
            )
            
            # 4. Anonymize audit logs (keep for legal)
            await conn.execute("""
                UPDATE audit_logs 
                SET user_id = NULL, 
                    meta = jsonb_set(meta, '{anonymized}', 'true')
                WHERE user_id = $1
            """, user_id)
            
            # 5. Delete user record
            await conn.execute(
                "DELETE FROM users WHERE id = $1", user_id
            )
```

### 5. Data Retention Policy

**Configurable Retention:**
```typescript
interface RetentionSettings {
  // Auto-delete chat messages after N days (0 = keep forever)
  messageRetentionDays: number;
  
  // Auto-delete attachments after N days
  attachmentRetentionDays: number;
  
  // Keep location history for N days
  locationHistoryDays: number;
}
```

**Default Retention:**
| Data Type | Default Retention | User Configurable |
|-----------|-------------------|-------------------|
| Messages | Forever | Yes (30-365 days or forever) |
| Attachments | 90 days | Yes (30-365 days) |
| Location history | 7 days | Yes (1-30 days) |
| Audit logs | 365 days | No |
| Sessions | 180 days | No |

## UI Components Needed

### Settings Page

```typescript
// frontend/app/(app)/settings/privacy/page.tsx

export default function PrivacySettingsPage() {
  return (
    <div className="space-y-6">
      <Section title="Discoverability">
        <Toggle
          label="Make my profile discoverable"
          description="When off, you won't appear in search or suggestions"
          {...register('discoverable')}
        />
        {isDiscoverable && (
          <>
            <Toggle label="Show in user search" {...register('showInSearch')} />
            <Toggle label="Show in nearby" {...register('showInNearby')} />
            <Toggle label="Show in campus directory" {...register('showInCampus')} />
          </>
        )}
      </Section>
      
      <Section title="Location Sharing">
        <Toggle
          label="Enable proximity features"
          {...register('proximityEnabled')}
        />
        {isProximityEnabled && (
          <Select
            label="Distance precision"
            options={[
              { value: 'exact', label: 'Exact distance' },
              { value: 'approximate', label: 'Approximate (within 500m)' },
              { value: 'zone', label: 'Zone only (nearby/on campus)' },
            ]}
            {...register('distanceGranularity')}
          />
        )}
      </Section>
      
      <Section title="Your Data">
        <Button onClick={requestExport}>Download my data</Button>
        <Button variant="danger" onClick={requestDeletion}>
          Delete my account
        </Button>
      </Section>
    </div>
  );
}
```

## Action Items

1. [ ] Implement discoverability filters in search/nearby queries
2. [ ] Add distance granularity logic to proximity service
3. [ ] Complete data export generation (currently stub)
4. [ ] Implement hard delete job for account deletion
5. [ ] Build privacy settings UI page
6. [ ] Add retention settings to privacy schema
7. [ ] Create automated retention enforcement job
