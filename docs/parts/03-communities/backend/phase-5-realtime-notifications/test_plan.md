# test_plan.md — Communities · Backend Phase 5 — Realtime & Notifications

## Scope
- Validate realtime events, notification persistence, counters, email/push queuing, rate limits, and presence

## Unit
- NotificationBuilder: inserts once per unique window
- Unread counter increment/decrement correctness
- Duplicate within 10 min window ignored
- Rate limiter bucket accuracy

## Integration
- Emit flow: post/comment created → Stream message → Socket emit → Notification persisted
- Mark read: unread count decrements
- Presence: client join emits presence.changed; expiry clears offline
- Email/Push: notif:outbound receives events; duplicates deduped
- Pagination: /notifications returns items; cursor stable
- ACL: unauthorized Socket.IO connection rejected; non-member cannot join group namespace

## Performance
- 10k concurrent sockets: heartbeat < 30 ms jitter
- 100 notifs/sec ingestion stable
- Mark-read p95 < 40 ms

## Resilience
- Redis restart: pending outbox reprocessed
- Socket reconnect resumes rooms
- Email/push queue backlog drained

## E2E scenario
- User posts, member receives socket event, notification row inserted, unread count updated, mark read, event promotion, push queued, presence tracker updates

## Coverage targets
- ≥85% workers/sockets; ≥80% API; ≥70% simulated Socket.IO coverage via integration tests
