import { io, Socket } from "socket.io-client";
import { ulid } from "ulidx";

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

type Listener = (message: ChatMessage) => void;

let socket: Socket | null = null;
const messageListeners = new Set<Listener>();
const deliveredListeners = new Set<(payload: { peerId: string; conversationId: string; deliveredSeq: number }) => void>();

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

export function initChatSocket(baseUrl: string, userId: string, campusId: string): Socket {
	if (socket) {
		return socket;
	}
	socket = io(`${baseUrl}/chat`, {
		transports: ["websocket"],
		auth: {
			userId,
			campusId,
		},
	});
	socket.on("chat:message", (payload) => {
		messageListeners.forEach((listener) => listener(transformMessage(payload)));
	});
	socket.on("chat:echo", (payload) => {
		messageListeners.forEach((listener) => listener(transformMessage(payload)));
	});
	socket.on("chat:delivered", (payload) => {
		deliveredListeners.forEach((listener) => listener(payload));
	});
	return socket;
}

export function onMessage(listener: Listener): () => void {
	messageListeners.add(listener);
	return () => messageListeners.delete(listener);
}

export function onDelivered(listener: (payload: { peerId: string; conversationId: string; deliveredSeq: number }) => void): () => void {
	deliveredListeners.add(listener);
	return () => deliveredListeners.delete(listener);
}

export function disconnectChatSocket(): void {
	if (socket) {
		socket.disconnect();
		socket = null;
		messageListeners.clear();
		deliveredListeners.clear();
	}
}

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
