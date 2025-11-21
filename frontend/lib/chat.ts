import type { Socket } from "socket.io-client";
import { ulid } from "ulidx";

import {
	connectChatSocket,
	disconnectChatSocket as teardownChatSocket,
	getChatSocketInstance,
	getChatSocketStatus,
	onChatSocketStatus,
} from "@/app/lib/socket/chat";

export type ChatMessage = {
	messageId: string;
	clientMsgId: string;
	seq: number;
	conversationId: string;
	senderId: string;
	recipientId: string;
	body: string;
	attachments: Array<{
		attachmentId: string;
		mediaType: string;
		sizeBytes?: number;
		fileName?: string;
		remoteUrl?: string;
	}>;
	createdAt: string;
};

export type ChatDeliveryEvent = {
	peerId: string;
	conversationId: string;
	deliveredSeq: number;
	source?: "send" | "ack" | "outbox" | string;
};

type Listener = (message: ChatMessage) => void;

let socket: Socket | null = null;
const messageListeners = new Set<Listener>();
const deliveredListeners = new Set<(payload: ChatDeliveryEvent) => void>();

function handleServerMessage(payload: unknown): void {
	messageListeners.forEach((listener) => listener(transformMessage(payload)));
}

function handleServerEcho(payload: unknown): void {
	messageListeners.forEach((listener) => listener(transformMessage(payload)));
}

function transformDeliveryPayload(raw: unknown): ChatDeliveryEvent {
	if (!isRecord(raw)) {
		return { peerId: "", conversationId: "", deliveredSeq: 0 };
	}
	const peerId = readString(pick(raw, ["peer_id", "peerId"])) ?? "";
	const conversationId = readString(pick(raw, ["conversation_id", "conversationId"])) ?? "";
	const deliveredSeq = readNumber(pick(raw, ["delivered_seq", "deliveredSeq"])) ?? 0;
	const source = readString(pick(raw, ["source"])) as ChatDeliveryEvent["source"] | undefined;
	return {
		peerId,
		conversationId,
		deliveredSeq,
		source,
	};
}

function handleDelivered(payload: unknown): void {
	const transformed = transformDeliveryPayload(payload);
	deliveredListeners.forEach((listener) => listener(transformed));
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

function pick(source: Record<string, unknown>, keys: string[]): unknown {
	for (const key of keys) {
		if (key in source) {
			return source[key];
		}
	}
	return undefined;
}

function readString(value: unknown): string | undefined {
	return typeof value === "string" ? value : undefined;
}

function readNumber(value: unknown): number | undefined {
	const numeric = typeof value === "number" ? value : Number(value);
	return Number.isFinite(numeric) ? numeric : undefined;
}

function transformAttachment(entry: unknown): ChatMessage["attachments"][number] | null {
	if (!isRecord(entry)) {
		return null;
	}
	const attachmentId = readString(pick(entry, ["attachment_id", "attachmentId"]));
	const mediaType = readString(pick(entry, ["media_type", "mediaType"]));
	if (!attachmentId || !mediaType) {
		return null;
	}
	const sizeBytes = readNumber(pick(entry, ["size_bytes", "sizeBytes"]));
	const fileName = readString(pick(entry, ["file_name", "fileName"]));
	const remoteUrl = readString(pick(entry, ["remote_url", "remoteUrl"]));
	return {
		attachmentId,
		mediaType,
		sizeBytes,
		fileName,
		remoteUrl,
	};
}

export function initChatSocket(_baseUrl: string, userId: string, campusId: string): Socket {
  if (!userId) {
    throw new Error("Chat socket unavailable: missing user id");
  }
  if (socket) {
    return socket;
  }
  const instance = (connectChatSocket({ userId, campusId }) ?? getChatSocketInstance()) as Socket | null;
  if (!instance) {
    throw new Error("Chat socket unavailable");
  }
  socket = instance;
	socket.on("chat:message", handleServerMessage);
	socket.on("chat:echo", handleServerEcho);
	socket.on("chat:delivered", handleDelivered);
	return socket;
}

export function onMessage(listener: Listener): () => void {
	messageListeners.add(listener);
	return () => messageListeners.delete(listener);
}

export function onDelivered(listener: (payload: ChatDeliveryEvent) => void): () => void {
	deliveredListeners.add(listener);
	return () => deliveredListeners.delete(listener);
}

export function disconnectChatSocket(): void {
	if (socket) {
		socket.off("chat:message", handleServerMessage);
		socket.off("chat:echo", handleServerEcho);
		socket.off("chat:delivered", handleDelivered);
		socket = null;
		messageListeners.clear();
		deliveredListeners.clear();
	}
	teardownChatSocket();
}

export { onChatSocketStatus, getChatSocketStatus };

function transformMessage(raw: unknown): ChatMessage {
	if (!isRecord(raw)) {
		return {
			messageId: ulid(),
			clientMsgId: ulid(),
			seq: 0,
			conversationId: "",
			senderId: "",
			recipientId: "",
			body: "",
			attachments: [],
			createdAt: new Date().toISOString(),
		};
	}
	const attachmentsSource = raw.attachments;
	const attachments = Array.isArray(attachmentsSource)
		? attachmentsSource
				.map((entry) => transformAttachment(entry))
				.filter((entry): entry is ChatMessage["attachments"][number] => entry !== null)
		: [];
	const messageId = readString(pick(raw, ["message_id", "messageId"])) ?? ulid();
	const clientMsgId = readString(pick(raw, ["client_msg_id", "clientMsgId"])) ?? ulid();
	const seq = readNumber(pick(raw, ["seq"])) ?? 0;
	const conversationId = readString(pick(raw, ["conversation_id", "conversationId"])) ?? "";
	const senderId = readString(pick(raw, ["sender_id", "senderId"])) ?? "";
	const recipientId = readString(pick(raw, ["recipient_id", "recipientId"])) ?? "";
	const body = readString(pick(raw, ["body"])) ?? "";
	const createdAt = readString(pick(raw, ["created_at", "createdAt"])) ?? new Date().toISOString();
	return {
		messageId,
		clientMsgId,
		seq,
		conversationId,
		senderId,
		recipientId,
		body,
		attachments,
		createdAt,
	};
}

export function newClientMessageId(): string {
	return ulid();
}

export function normalizeChatMessages(raw: unknown): ChatMessage[] {
	if (Array.isArray(raw)) {
		return raw.map((entry) => transformMessage(entry));
	}
	if (isRecord(raw)) {
		if (Array.isArray(raw.items)) {
			return raw.items.map((entry) => transformMessage(entry));
		}
		if (Array.isArray(raw.messages)) {
			return raw.messages.map((entry) => transformMessage(entry));
		}
		if (Array.isArray(raw.data)) {
			return raw.data.map((entry) => transformMessage(entry));
		}
	}
	return [];
}

export function mergeChatMessages(existing: ChatMessage[], incoming: ChatMessage[]): ChatMessage[] {
	if (!incoming.length) {
		return existing;
	}
	const byId = new Map<string, ChatMessage>();
	for (const message of existing) {
		const key = message.clientMsgId || message.messageId;
		if (key) {
			byId.set(key, message);
		}
	}
	for (const message of incoming) {
		const key = message.clientMsgId || message.messageId;
		if (key) {
			byId.set(key, message);
		}
	}
	return [...byId.values()].sort((a, b) => {
		if (a.seq !== b.seq) {
			return a.seq - b.seq;
		}
		return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
	});
}
