import { apiFetch as httpFetch, type ApiFetchOptions } from '@/app/lib/http/client';
import type { Socket } from 'socket.io-client';
import {
	connectRoomsSocket,
	disconnectRoomsSocket as teardownRoomsSocket,
	getRoomsSocketInstance,
	getRoomsSocketStatus,
	onRoomsSocketStatus,
} from '@/app/lib/socket/rooms';

export type RoomRole = 'owner' | 'moderator' | 'member';

export type RoomSummary = {
	id: string;
	campus_id: string;
	name: string;
	preset: string;
	capacity: number;
	visibility: string;
	join_code: string | null;
	owner_id: string;
	members_count: number;
	role: RoomRole;
};

export type RoomMemberSummary = {
	user_id: string;
	role: RoomRole;
	muted: boolean;
	joined_at: string;
};

export type RoomDetail = RoomSummary & { members: RoomMemberSummary[] };

export type RoomMessageKind = 'text' | 'image' | 'file';

export type RoomMessageDTO = {
	id: string;
	room_id: string;
	seq: number;
	sender_id: string;
	client_msg_id?: string;
	kind: RoomMessageKind;
	content?: string | null;
	media_key?: string | null;
	media_mime?: string | null;
	media_bytes?: number | null;
	created_at: string;
};

export type RoomHistoryResponse = {
	items: RoomMessageDTO[];
	cursor: string | null;
	direction: 'forward' | 'backward';
};

export type RoomMessageSend = {
	client_msg_id: string;
	kind: RoomMessageKind;
	content?: string;
	media_key?: string | null;
	media_mime?: string | null;
	media_bytes?: number | null;
};

type TypingEvent = { room_id: string; user_id: string; on: boolean };

export type RoomsServerEvents = {
	'rooms:ack': (payload: { ok: boolean }) => void;
	'room:created': (summary: RoomSummary) => void;
	'room:updated': (summary: RoomSummary) => void;
	'room:member_joined': (payload: { room_id: string; user_id: string; role: RoomRole }) => void;
	'room:member_left': (payload: { room_id: string; user_id: string }) => void;
	'room:member_updated': (payload: { room_id: string; user_id: string; role: RoomRole; muted: boolean }) => void;
	'room:msg:new': (message: RoomMessageDTO) => void;
	'room:msg:delivered': (payload: { room_id: string; user_id: string; up_to_seq: number }) => void;
	'room:msg:read': (payload: { room_id: string; user_id: string; up_to_seq: number }) => void;
	'room:typing': (payload: TypingEvent) => void;
};

export type RoomsClientEvents = {
	'room:join': (payload: { room_id: string }) => void;
	'room:leave': (payload: { room_id: string }) => void;
	'room:typing': (payload: TypingEvent) => void;
};

export type RoomsSocket = Socket<RoomsServerEvents, RoomsClientEvents>;

const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL ?? '';
let socketInstance: RoomsSocket | null = null;

function resolveUrl(path: string): string {
	if (!API_BASE) {
		return path;
	}
	return path.startsWith('/') ? `${API_BASE}${path}` : `${API_BASE}/${path}`;
}

async function apiFetch<T>(path: string, init?: ApiFetchOptions): Promise<T> {
	return httpFetch<T>(resolveUrl(path), init);
}

async function apiPost<T>(path: string, body?: unknown, init?: ApiFetchOptions): Promise<T> {
	return apiFetch<T>(path, {
		method: 'POST',
		body,
		...init,
	});
}

async function apiPostOk(path: string, body?: unknown): Promise<void> {
	await apiPost<{ ok: boolean }>(path, body);
}

export async function createRoom(payload: { name: string; preset: string; visibility: string }): Promise<RoomSummary> {
	return apiPost<RoomSummary>('/rooms/create', payload);
}

export async function listMyRooms(): Promise<RoomSummary[]> {
	return apiFetch<RoomSummary[]>('/rooms/my');
}

export async function getRoom(roomId: string): Promise<RoomDetail> {
	return apiFetch<RoomDetail>(`/rooms/${roomId}`);
}

export async function rotateInviteCode(roomId: string): Promise<{ join_code: string | null }> {
	return apiPost<{ join_code: string | null }>(`/rooms/${roomId}/invite-code/rotate`);
}

export async function joinByCode(join_code: string): Promise<RoomSummary> {
	return apiPost<RoomSummary>('/rooms/join/by-code', { join_code });
}

export async function joinRoom(roomId: string): Promise<RoomSummary> {
	return apiPost<RoomSummary>(`/rooms/${roomId}/join`);
}

export async function leaveRoom(roomId: string): Promise<void> {
	await apiPostOk(`/rooms/${roomId}/leave`);
}

export async function updateMemberRole(roomId: string, userId: string, role: RoomRole): Promise<void> {
	await apiPostOk(`/rooms/${roomId}/members/${userId}/role`, { role });
}

export async function muteMember(roomId: string, userId: string, on: boolean): Promise<void> {
	await apiPostOk(`/rooms/${roomId}/members/${userId}/mute`, { on });
}

export async function kickMember(roomId: string, userId: string): Promise<void> {
	await apiPostOk(`/rooms/${roomId}/members/${userId}/kick`);
}

export async function sendRoomMessage(roomId: string, payload: RoomMessageSend): Promise<RoomMessageDTO> {
	return apiPost<RoomMessageDTO>(`/rooms/${roomId}/send`, payload);
}

export async function fetchHistory(
	roomId: string,
	params?: { cursor?: string; direction?: 'forward' | 'backward'; limit?: number },
): Promise<RoomHistoryResponse> {
	const search = new URLSearchParams();
	if (params?.cursor) search.set('cursor', params.cursor);
	if (params?.direction) search.set('direction', params.direction);
	if (params?.limit) search.set('limit', params.limit.toString());
	const query = search.toString();
	const suffix = query ? `?${query}` : '';
	return apiFetch<RoomHistoryResponse>(`/rooms/${roomId}/history${suffix}`);
}

export async function markRead(roomId: string, upToSeq: number): Promise<void> {
	await apiPostOk(`/rooms/${roomId}/read`, { up_to_seq: upToSeq });
}

export function roomsSocket(): RoomsSocket {
	if (socketInstance) {
		return socketInstance;
	}
	const instance = (connectRoomsSocket() ?? getRoomsSocketInstance()) as RoomsSocket | null;
	if (!instance) {
		throw new Error('Rooms socket unavailable');
	}
	socketInstance = instance;
	return instance;
}

export function disconnectRoomsSocket(): void {
	teardownRoomsSocket();
	socketInstance = null;
}

export { onRoomsSocketStatus, getRoomsSocketStatus };
