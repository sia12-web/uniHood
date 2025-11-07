import { initChatSocket, onMessage } from "@/lib/chat";

type Listener = (counts: Record<string, number>) => void;

const STORAGE_KEY = "divan:chat-unread-counts";

let counts: Record<string, number> = {};
let hydrated = false;
const listeners: Set<Listener> = new Set();
let boundUserId: string | null = null;
let activePeerId: string | null = null;
let unsubscribeMessage: (() => void) | null = null;

function safeWindow(): Window | null {
	if (typeof window === "undefined") {
		return null;
	}
	return window;
}

function hydrate(): void {
	if (hydrated) {
		return;
	}
	hydrated = true;
	const win = safeWindow();
	if (!win) {
		counts = {};
		return;
	}
	try {
		const raw = win.sessionStorage.getItem(STORAGE_KEY);
		if (!raw) {
			counts = {};
			return;
		}
		const parsed = JSON.parse(raw);
		if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
			counts = Object.entries(parsed as Record<string, unknown>).reduce<Record<string, number>>((acc, [peerId, value]) => {
				const numeric = Number(value);
				if (Number.isFinite(numeric) && numeric > 0) {
					acc[peerId] = numeric;
				}
				return acc;
			}, {});
		}
	} catch {
		counts = {};
	}
}

function snapshot(): Record<string, number> {
	return { ...counts };
}

function persist(): void {
	const win = safeWindow();
	if (win) {
		try {
			if (Object.keys(counts).length === 0) {
				win.sessionStorage.removeItem(STORAGE_KEY);
			} else {
				win.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(counts));
			}
		} catch {
			// ignore storage write errors
		}
	}
	const current = snapshot();
	listeners.forEach((listener) => {
		listener(current);
	});
}

function setCount(peerId: string, value: number): void {
	if (value <= 0) {
		if (peerId in counts) {
			delete counts[peerId];
			persist();
		}
		return;
	}
	counts[peerId] = value;
	persist();
}

function incrementPeer(peerId: string): void {
	hydrate();
	setCount(peerId, (counts[peerId] ?? 0) + 1);
}

function resetPeer(peerId: string): void {
	hydrate();
	setCount(peerId, 0);
}

export function subscribeUnreadCounts(listener: Listener): () => void {
	hydrate();
	listeners.add(listener);
	listener(snapshot());
	return () => {
		listeners.delete(listener);
	};
}

export function getUnreadCounts(): Record<string, number> {
	hydrate();
	return snapshot();
}

export function getTotalUnread(): number {
	hydrate();
	return Object.values(counts).reduce((total, value) => total + value, 0);
}

export function acknowledgeConversation(peerId: string): void {
	hydrate();
	resetPeer(peerId);
}

export function acknowledgeAllConversations(): void {
	hydrate();
	counts = {};
	persist();
}

export function setActiveChatPeer(peerId: string | null): void {
	activePeerId = peerId;
	if (peerId) {
		acknowledgeConversation(peerId);
	}
}

export function clearUnreadState(): void {
	counts = {};
	persist();
	activePeerId = null;
	boundUserId = null;
	if (unsubscribeMessage) {
		unsubscribeMessage();
		unsubscribeMessage = null;
	}
}

export function bindChatUnreadSocket(baseUrl: string, userId: string, campusId: string | null | undefined): void {
	if (!userId || !campusId) {
		return;
	}
	initChatSocket(baseUrl, userId, campusId);
	if (boundUserId === userId && unsubscribeMessage) {
		return;
	}
	if (unsubscribeMessage) {
		unsubscribeMessage();
		unsubscribeMessage = null;
	}
	boundUserId = userId;
	unsubscribeMessage = onMessage((message) => {
		const senderIsSelf = message.senderId === userId;
		const peerId = senderIsSelf ? message.recipientId : message.senderId;
		if (!peerId) {
			return;
		}
		if (senderIsSelf) {
			acknowledgeConversation(peerId);
			return;
		}
		if (activePeerId && activePeerId === peerId) {
			acknowledgeConversation(peerId);
			return;
		}
		incrementPeer(peerId);
	});
}
