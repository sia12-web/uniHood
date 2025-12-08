import { describe, expect, it } from "vitest";

import type { RoomMessageDTO } from "@/lib/rooms";

/**
 * upsertMessage function - copied from meetup detail page for testing
 * In production, this should be extracted to a shared utility
 */
function upsertMessage(prev: RoomMessageDTO[], incoming: RoomMessageDTO): RoomMessageDTO[] {
    const existingIndex = prev.findIndex(
        (message) => message.id === incoming.id || (incoming.client_msg_id && message.client_msg_id === incoming.client_msg_id),
    );
    if (existingIndex >= 0) {
        const next = [...prev];
        next[existingIndex] = incoming;
        return next;
    }
    return [...prev, incoming].sort((a, b) => a.seq - b.seq);
}

describe("Meetups Chat - upsertMessage", () => {
    const baseMessage: RoomMessageDTO = {
        id: "msg-1",
        room_id: "room-1",
        seq: 1,
        sender_id: "user-1",
        kind: "text",
        content: "Hello",
        created_at: "2024-01-01T00:00:00Z",
    };

    it("adds a new message when no matching id or client_msg_id exists", () => {
        const prev: RoomMessageDTO[] = [];
        const result = upsertMessage(prev, baseMessage);

        expect(result).toHaveLength(1);
        expect(result[0]).toEqual(baseMessage);
    });

    it("replaces message when id matches", () => {
        const prev: RoomMessageDTO[] = [baseMessage];
        const updated = { ...baseMessage, content: "Updated" };
        const result = upsertMessage(prev, updated);

        expect(result).toHaveLength(1);
        expect(result[0].content).toBe("Updated");
    });

    it("replaces optimistic message when client_msg_id matches", () => {
        const clientMsgId = "client-123";
        const optimisticMessage: RoomMessageDTO = {
            id: "optimistic-client-123",
            room_id: "room-1",
            seq: Date.now(),
            sender_id: "user-1",
            client_msg_id: clientMsgId,
            kind: "text",
            content: "Hello",
            created_at: "2024-01-01T00:00:00Z",
        };

        const serverConfirmedMessage: RoomMessageDTO = {
            id: "msg-real-id",
            room_id: "room-1",
            seq: 5,
            sender_id: "user-1",
            client_msg_id: clientMsgId,
            kind: "text",
            content: "Hello",
            created_at: "2024-01-01T00:00:01Z",
        };

        const prev: RoomMessageDTO[] = [optimisticMessage];
        const result = upsertMessage(prev, serverConfirmedMessage);

        expect(result).toHaveLength(1);
        expect(result[0].id).toBe("msg-real-id");
        expect(result[0].seq).toBe(5);
    });

    it("maintains sort order by seq", () => {
        const msg1: RoomMessageDTO = { ...baseMessage, id: "msg-1", seq: 1 };
        const msg3: RoomMessageDTO = { ...baseMessage, id: "msg-3", seq: 3 };
        const msg2: RoomMessageDTO = { ...baseMessage, id: "msg-2", seq: 2 };

        let result = upsertMessage([], msg1);
        result = upsertMessage(result, msg3);
        result = upsertMessage(result, msg2);

        expect(result.map(m => m.seq)).toEqual([1, 2, 3]);
    });
});

describe("Meetups Chat - Optimistic Updates", () => {
    it("optimistic message appears immediately with temporary id", () => {
        const clientMsgId = "client-456";
        const optimisticMessage: RoomMessageDTO = {
            id: `optimistic-${clientMsgId}`,
            room_id: "room-1",
            seq: Date.now(),
            sender_id: "current-user",
            client_msg_id: clientMsgId,
            kind: "text",
            content: "My message",
            created_at: new Date().toISOString(),
        };

        const messages: RoomMessageDTO[] = [];
        const result = upsertMessage(messages, optimisticMessage);

        expect(result).toHaveLength(1);
        expect(result[0].id).toContain("optimistic-");
        expect(result[0].content).toBe("My message");
    });

    it("server response replaces optimistic message using client_msg_id", () => {
        const clientMsgId = "client-789";

        // First, add optimistic message
        const optimisticMessage: RoomMessageDTO = {
            id: `optimistic-${clientMsgId}`,
            room_id: "room-1",
            seq: Date.now(),
            sender_id: "current-user",
            client_msg_id: clientMsgId,
            kind: "text",
            content: "My message",
            created_at: new Date().toISOString(),
        };

        let messages = upsertMessage([], optimisticMessage);
        expect(messages).toHaveLength(1);
        expect(messages[0].id).toContain("optimistic-");

        // Then, server confirms with real id
        const serverMessage: RoomMessageDTO = {
            id: "real-server-id-123",
            room_id: "room-1",
            seq: 42,
            sender_id: "current-user",
            client_msg_id: clientMsgId,
            kind: "text",
            content: "My message",
            created_at: new Date().toISOString(),
        };

        messages = upsertMessage(messages, serverMessage);

        // Should still be 1 message, now with the real id
        expect(messages).toHaveLength(1);
        expect(messages[0].id).toBe("real-server-id-123");
        expect(messages[0].seq).toBe(42);
    });

    it("failed message can be removed by filtering client_msg_id", () => {
        const clientMsgId = "client-failed";

        const optimisticMessage: RoomMessageDTO = {
            id: `optimistic-${clientMsgId}`,
            room_id: "room-1",
            seq: Date.now(),
            sender_id: "current-user",
            client_msg_id: clientMsgId,
            kind: "text",
            content: "Failed message",
            created_at: new Date().toISOString(),
        };

        let messages = upsertMessage([], optimisticMessage);
        expect(messages).toHaveLength(1);

        // Simulate error handling - remove by client_msg_id
        messages = messages.filter((m) => m.client_msg_id !== clientMsgId);

        expect(messages).toHaveLength(0);
    });
});
