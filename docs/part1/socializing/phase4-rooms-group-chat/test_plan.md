# Phase 4: Rooms & Group Chat – Test Plan

## Scope
- Room creation, join/leave, member management
- Group chat message send/receive
- Outbox/delivery reliability
- Attachments
- Socket events (join, message, typing, presence)

## Test Cases
- Create room (REST)
- List/join/leave room (REST)
- Send/receive group message (REST + socket)
- Delivery tracking (outbox)
- Attachments upload/download
- Roster updates (socket)
- Typing/presence events
