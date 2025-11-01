# Phase 3: 1:1 Chat Transport Spec

## Goals
- Provide near-real-time messaging between two users.
- Ensure ordered delivery using per-conversation sequence numbers.
- Support attachment metadata and delivery receipts.
- Provide sockets for live updates and delivery acknowledgements.

## IDs and sequencing
- All message identifiers (`message_id`, `client_msg_id`, attachment IDs) are ULIDs.
- Sequence numbers (`seq`) are monotonically increasing per conversation.
- Backend uses `chat_seq` table with `FOR UPDATE` row locking to increment `last_seq` atomically.

## Data model (Postgres)
- `chat_conversations(conversation_id PK, user_a, user_b, created_at)`.
- `chat_seq(conversation_id PK, last_seq INTEGER)` – tracker for next sequence.
- `chat_messages(conversation_id, seq, message_id PK, client_msg_id, sender_id, recipient_id, body TEXT, attachments JSONB, created_at TIMESTAMPTZ)`.
- `chat_delivery(conversation_id, user_id, delivered_seq INTEGER)` for per-user acknowledgement.

## REST API
- `POST /chat/messages`
	- Body `{ to_user_id, body, client_msg_id?, attachments?[] }`.
	- Returns message envelope with seq, ids, attachments, ISO timestamps.
- `GET /chat/conversations/{user_id}/messages?cursor=&limit=`
	- Cursor encodes last `(conversation_id, seq)` base64.
	- Returns `{ items: [...], next_cursor }`.
- `POST /chat/conversations/{user_id}/deliveries`
	- Body `{ delivered_seq }`.
	- Advances `chat_delivery` for the authenticated user, emits socket delivery event to peer.
- `GET /chat/conversations/{user_id}/outbox?limit=`
	- Retrieves messages for the auth user beyond their last delivered sequence.

## Socket.IO (`/chat` namespace)
- On connect, server adds client to `user:{id}` room.
- Events:
	- `chat:message` (delivers message to recipient).
	- `chat:echo` (mirrors sent message to sender).
	- `chat:delivered` (`{ peer_id, conversation_id, delivered_seq }`).
	- `chat:typing` emitted to peer when typing payload is received.

## Delivery policy
- Delivery progression updates `chat_delivery.delivered_seq` when:
	1. Server successfully emits initial message to recipient.
	2. Client acknowledges via REST API.
	3. Server replays outbox during reconnect.
- Each update emits `chat:delivered` to peers.

## Attachments
- Metadata only; upload integration is deferred.
- Allowed media types: image/*, video/*, audio/*, application/pdf.
- Attachment list normalized server-side; ULIDs generated when absent.

## Frontend integration
- `frontend/lib/chat.ts` wraps socket management and ULID generation (via `ulidx`).
- `ChatWindow` component renders message timeline and send form.
- `MessageItem` handles per-message alignment.
- `TypingDots` renders simple animated indicator when active.

## TODO / Phase 4 hooks
- Persisted attachment storage and signed URLs.
- Read receipts vs delivery (distinguish when user views message).
- Conversation list API for multiple chats.
