# Phase 3: Chat Transport Test Plan

## Unit tests
- **Attachments normalisation**: ensure allowed media types pass and unsupported types raise `ValueError`.
- **Conversation key**: verify ordering of participants and conversation id format.
- **In-memory store**: tests for sequence increment, outbox filtering, delivered sequence persistence.
- **Service send**: confirm self-message rejection, ULID generation, socket emit invocations (mock sockets module).

## Integration tests (async FastAPI)
- **POST /chat/messages**: create message, response includes seq=1, message_id ULID, attachments flattened.
- **GET /chat/conversations/{user}/messages**: fetch messages with cursor pagination.
- **Delivery acknowledgement**: posting delivered_seq updates repo and emits `chat:delivered` to peer mock.
- **Outbox replay**: after acknowledging seq 2, request outbox and expect messages >2, plus delivery emission.

## Socket tests
- Use Socket.IO test client to ensure connect auto-joins `user:{id}` room and receives `chat:ack`.
- Verify `chat:message` emission on send and `chat:delivered` emission after ack.

## Frontend tests (Vitest)
- `ChatWindow` render: submitting form calls `onSend` with trimmed body.
- `MessageItem` alignment toggles by sender id.
- `chat.ts` socket helpers: `onMessage` notifies listeners, `newClientMessageId` returns ULID string.

## Manual smoke
1. Start backend with Postgres + Redis.
2. Connect two Socket.IO clients (user A/B) and send messages across.
3. Observe delivery events in browser console.
4. Restart client to trigger outbox replay.
