# Communities · Backend Phase 1 — Groups & Posts Core · Test Plan

## 0) Scope
Unit, integration, and end-to-end coverage for group membership, posts, comments, reactions, uploads, attachments, outbox indexing, and socket fan-out.

## 1) Unit Tests
- **Policies**
  - Public groups allow non-member reads; private/secret require membership.
  - Posting denied when `group.is_locked` or member banned/muted.
  - Moderator/admin capabilities for pinning, deleting, and banning.
- **Repositories**
  - Soft-delete persists tombstones while hiding from list queries.
  - `comments_count` / `reactions_count` increments/decrements atomically.
  - Keyset pagination honors `(created_at, id)` ties; ensure deterministic ordering.
- **Idempotency**
  - Reusing `Idempotency-Key` returns cached response.
  - Conflicting payload with same key yields 409.
- **Validators**
  - Mime allowlist matches image/*, video/mp4, application/pdf.
  - Size ≤ 100 MB; attachments limit enforced (10/post, 3/comment).
  - Topic tag normalization (lowercase, dedupe).

## 2) API (FastAPI) Integration
- **Groups**
  - Create group → unique slug, tags persisted.
  - Visibility respected: public accessible to all; private/secret hidden from non-members (403/404).
  - Update allows admins to lock group, change visibility.
  - Soft-delete returns 404 for non-admins.
- **Members**
  - Join public group auto-approves.
  - Role elevation/demotion; ban/mute enforcement.
  - Removal leaves existing posts/comments visible but blocks new writes.
- **Posts**
  - List endpoint returns keyset cursor when > limit.
  - Create requires membership and unlocked group.
  - Update restricted to author/moderator; pin/unpin admin/mod only.
  - Deleted posts hidden from list; moderators can still fetch with audit flag.
- **Comments**
  - Nested comments up to depth 5; parent validation.
  - Listing chronological; optional parent filter.
  - Deletion decrements `comments_count`.
- **Reactions**
  - Duplicate add (same emoji/user) returns 409.
  - Delete restricted to author; counters adjust.
- **Uploads & Attachments**
  - Presign enforces mime/size; TTL asserted.
  - Attachment creation requires existing subject; increments `media_count`.
- **Tags**
  - Prefix search returns matches; deduplicated.

## 3) Outbox & OpenSearch (Mocked)
- CRUD events insert `outbox_event` rows with correct payload.
- Worker locks batches (FOR UPDATE SKIP LOCKED), marks processed.
- Retry logic exponential backoff; DLQ after N failures (mock N=5).

## 4) Redis Streams & Socket Emission (Mocked)
- Post/comment creation pushes records to `comm:post` / `comm:comment`.
- Stream emitter reads once, emits Socket.IO event, acknowledges.
- Idempotent on stream IDs.

## 5) Security / AuthZ
- Unauthenticated callers → 401 on write endpoints.
- Non-members blocked (403) from private/secret group resources.
- Banned/muted members blocked from posting/commenting/reacting.

## 6) Performance & Limits
- `GET /groups/{id}/posts?limit=50` returns < 100 ms with seeded dataset.
- Attachment limit enforcement returns 422 when exceeded.
- Body length validation (post ≤40k, comment ≤10k) returns 400 on violation.

## 7) End-to-End Happy Path
1. User A creates a public group (owner).
2. User B joins (member).
3. User B creates a post with two attachments (presign + attach).
4. User A comments; User B replies (nested).
5. User A reacts 👍 on post; User B reacts 🔥 on comment.
6. Validate counters and list cursors.
7. Soft-delete the comment; verify counts and hidden status.
8. Admin pins the post; confirm top placement (flag).
9. Confirm outbox emitted events for group/post/comment.

## 8) Tooling
- Pytest, pytest-asyncio.
- Testcontainers for PostgreSQL 16, Redis, Localstack S3, OpenSearch (or stub clients).
- 85%+ coverage target for `app/communities` package.

## 9) Fixtures
- Factory fixtures for users, groups (public/private/secret), posts, comments, reactions.
- Seeded time offsets for keyset pagination boundary testing.
- Reusable S3 mock returning deterministic signed URLs.
