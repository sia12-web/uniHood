# spec.md — Communities · Backend Phase 5 — Realtime & Notifications

## Goals
- Socket.IO realtime for post/comment/event changes
- Persistent notifications table
- Delivery + unread counters
- Email/push queue producers

## Data Model
- PostgreSQL tables: notification_channel, notification_entity, unread_counter
- Insert notification → increment unread_counter
- Mark read → decrement
- 90 days retention

## Streams & Routing
- Redis Stream → realtime_dispatcher (Socket.IO emit) → notification_builder (PostgreSQL insert) → Redis Queue (email/push)

## Notification Semantics
- Deduplication, batching, delivery states
- Persisted regardless of delivery

## API (FastAPI)
- /notifications (list, mark read, unread count)
- /presence
- DTOs: Notification, Presence
- Keyset pagination

## Socket.IO Architecture
- Namespace hierarchy: /groups/{group_id}, /posts/{post_id}, /events/{event_id}, /user/{user_id}
- Auth via JWT
- Join rooms after handshake
- Event types: post.created, comment.created, reaction.updated, rsvp.promoted, notification.new, presence.changed
- Rate-limit emits per namespace
- Heartbeat, presence tracker

## Email / Push Queue
- Redis Stream notif:outbound
- Producers push tasks; consumer bridges to provider

## Workers
- realtime_dispatcher.py
- notification_builder.py
- unread_sync.py

## Anti-Abuse & Limits
- Max 5 notifications/sec/user persisted
- Rate-limit Socket.IO emits
- Ignore events where actor == target
- TTL for old notifications

## Observability
- Prometheus metrics: socket_connections_active, notif_insert_total, notif_emit_failures_total, notif_outbound_queue_total, presence_online_users
- Structured logs

## Security
- Socket namespaces require JWT and group membership validation
- No data leakage between groups
- Email/push payload sanitized

## Deliverables
- Migrations, workers, API routes, socket server, Redis TTL config, seed fixtures
