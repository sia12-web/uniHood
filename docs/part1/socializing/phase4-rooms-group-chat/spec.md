# Phase 4: Rooms & Group Chat – Spec

## Overview
- Add support for multi-user rooms and group chat.
- Users can create rooms, join/leave, send messages, and see member lists.

## Features
- Room creation (name, group/DM, initial members)
- Room membership management (invite, join, leave, kick)
- Group chat message delivery (with sequencing, outbox, delivery tracking)
- Room roster and presence
- Attachments in group chat
- Socket.IO for real-time events

## Data Model
- Room, RoomMember, RoomMessage, RoomAttachment, RoomDelivery

## API
- REST: /rooms, /rooms/{id}/messages, /rooms/{id}/members, etc.
- Socket: join/leave room, send/receive message, typing, presence

## Notes
- Use ULID for all IDs
- Per-room message sequence
- Room outbox/delivery for reliable delivery
