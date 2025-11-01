# test_plan.md — Communities · Backend Phase 1 — Groups & Posts Core

## 0) Scope
Unit, API, and E2E tests for groups, members, posts, comments, reactions, uploads, attachments, outbox & sockets.

## 1) Unit Tests
- **Policies**
  - public view allowed; private/secret requires membership.
  - post creation blocked when `group.is_locked`.
  - moderator/admin privileges (pin, delete others, ban).
- **Repositories**
  - insert/update/delete with soft-delete flags.
  - counters: comments_count / reactions_count monotonicity.
  - keyset pagination boundaries (exact `created_at` ties).
- **Idempotency**
  - same `Idempotency-Key` returns identical result; different body + same key → 409.
- **Validators**
  - mime allowlist, size bounds, topic tag normalization.

## 2) API (FastAPI) — Integration
- **Groups**
  - `POST /groups` creates with slug uniqueness; 409 on dup slug.
  - `GET /groups/{id}` respects visibility for non-members.
  - `PATCH /groups/{id}` admin-only fields (`is_locked`, `visibility`).
  - `DELETE /groups/{id}` soft-deletes; 404 afterwards for non-admins.
- **Members**
  - `POST /groups/{id}/members` join public; request recorded for private (Phase 6 will approve flow; here auto-approve if `visibility=public`).
  - `PATCH /groups/{id}/members/{uid}` role changes; ban/mute effects on posting.
  - `DELETE /groups/{id}/members/{uid}` removes member; author posts remain visible.
- **Posts**
  - list with keyset: deterministic cursors; `limit` caps; next_cursor when >limit.
  - create requires membership; `is_locked` blocks.
  - update only by author or moderator; pin/unpin admin/mod only.
  - delete soft-delete; list excludes deleted; `GET /posts/{id}` returns 404 if deleted and caller not moderator.
- **Comments**
  - create with `parent_id` optional; depth <=5 enforced.
  - list returns chronological order; parent filter works.
  - delete updates `comments_count` atomically.
- **Reactions**
  - add once per emoji; duplicate returns 409.
  - delete reaction by same user only; counters update.
- **Uploads/Attachments**
  - presign enforces mime/size; TTL ~15min.
  - `POST /attachments` links only existing subjects; post `media_count` increments; cap per post/comment enforced.
- **Tags**
  - `GET /tags?query=de` returns known tags by prefix; dedupe.

## 3) Outbox & OpenSearch (Mocked)
- On create/update/delete → outbox row exists with correct payload.
- Indexer pulls batches; marks `processed_at`; retries on temporary failure.
- DLQ after N failures (configure N=5 in test).

## 4) Redis Streams & Socket Emission (Mocked)
- Post/comment create → XADD called with correct fields.
- Stream emitter pushes socket event once per stream record (idempotent on `stream_id`).
- Ensure ordering within a single post room.

## 5) Security / AuthN/Z
- Unauthenticated → 401 on write.
- Non-member access to private/secret → 403 on list/posts/comments.
- Banned member → 403 on create post/comment/reaction.

## 6) Performance / Limits
- List posts `limit=50` completes within budget (<100ms on warm DB with 10k posts).
- Attachments: reject >10 per post, >3 per comment.
- Body sizes: enforce 40k/10k.

## 7) E2E (happy path)
1. User A creates public group (owner).
2. User B joins group (member).
3. User B creates a post with 2 images:
   - presign twice → upload → attach twice.
4. User A comments; User B replies (depth=1).
5. User A reacts 👍 on post; User B reacts 🔥 on comment.
6. Verify counts, list cursors, and that OpenSearch mocks received docs.
7. Soft-delete comment; counts decrement.
8. Admin pins the post; verify list shows pinned first (Phase 1 can expose as field; ordering change may come with feeds).

## 8) Tooling
- Pytest with `pytest-asyncio` for async views.
- Testcontainers: PostgreSQL 16, Redis, Localstack S3, OpenSearch (or mocked client).
- Coverage targets: ≥85% for api/domain layers.

## 9) Fixtures
- Factory fixtures for users, groups (public/private/secret), posts, comments.
- Randomized time skew to test keyset boundaries.
