# Index Plan (Query-shape driven)

## users
- UNIQUE (lower(email)) WHERE deleted_at IS NULL
- UNIQUE (lower(handle)) WHERE deleted_at IS NULL
- (campus_id, handle)
- GIN on privacy, status if filtered by keys

## sessions
- (user_id, last_used_at DESC)
- (user_id, revoked, last_used_at DESC)

## rooms
- (campus_id, kind, created_at DESC)
- (owner_id, created_at DESC)

## messages
- (room_id, created_at DESC)  -- pagination
- (sender_id, created_at DESC)
- (campus_id, created_at DESC) -- moderation/search
- GIN (meta) -- when searching flags/attributes

## invitations
- UNIQUE (from_id, to_id) WHERE deleted_at IS NULL
- (to_id, created_at DESC)
- (campus_id, status, created_at DESC)

## attachments
- (message_id, created_at)
- (user_id, created_at)
- (campus_id, created_at)

## activity_sessions
- (campus_id, type, started_at DESC)
