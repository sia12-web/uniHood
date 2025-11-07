import { getBackendUrl } from "./env";
import type { FriendRow, InviteSummary } from "./types";

type HttpMethod = "GET" | "POST";

const BASE_URL = getBackendUrl();

async function request<T>(
	path: string,
	userId: string,
	campusId: string | null,
	method: HttpMethod = "GET",
	body?: unknown,
): Promise<T> {
	const response = await fetch(`${BASE_URL}${path}`, {
		method,
		headers: {
			"Content-Type": "application/json",
			"X-User-Id": userId,
			...(campusId ? { "X-Campus-Id": campusId } : {}),
		},
		body: body ? JSON.stringify(body) : undefined,
	});
	if (!response.ok) {
		const text = await response.text();
		throw new Error(text || `Request failed (${response.status})`);
	}
	if (response.status === 204) {
		return undefined as unknown as T;
	}
	return (await response.json()) as T;
}

export async function fetchInviteInbox(userId: string, campusId: string | null): Promise<InviteSummary[]> {
	return request<InviteSummary[]>("/invites/inbox", userId, campusId);
}

export async function fetchInviteOutbox(userId: string, campusId: string | null): Promise<InviteSummary[]> {
	return request<InviteSummary[]>("/invites/outbox", userId, campusId);
}

export async function sendInvite(
	userId: string,
	campusId: string | null,
	toUserId: string,
	options: { campus_id?: string | null; note?: string | null } = {},
): Promise<InviteSummary> {
	return request<InviteSummary>("/invites/send", userId, campusId, "POST", {
		to_user_id: toUserId,
		campus_id: options.campus_id ?? campusId,
		note: options.note ?? undefined,
	});
}

export async function acceptInvite(
	userId: string,
	campusId: string | null,
	inviteId: string,
): Promise<InviteSummary> {
	return request<InviteSummary>(`/invites/${inviteId}/accept`, userId, campusId, "POST");
}

export async function declineInvite(
	userId: string,
	campusId: string | null,
	inviteId: string,
): Promise<InviteSummary> {
	return request<InviteSummary>(`/invites/${inviteId}/decline`, userId, campusId, "POST");
}

export async function cancelInvite(
	userId: string,
	campusId: string | null,
	inviteId: string,
): Promise<InviteSummary> {
	return request<InviteSummary>(`/invites/${inviteId}/cancel`, userId, campusId, "POST");
}

export async function fetchFriends(
	userId: string,
	campusId: string | null,
	filter: "accepted" | "blocked" | "pending" = "accepted",
): Promise<FriendRow[]> {
	return request<FriendRow[]>(`/friends/list?filter=${filter}`, userId, campusId);
}

export async function blockUser(
	userId: string,
	campusId: string | null,
	targetId: string,
): Promise<FriendRow> {
	return request<FriendRow>(`/friends/${targetId}/block`, userId, campusId, "POST");
}

export async function unblockUser(
	userId: string,
	campusId: string | null,
	targetId: string,
): Promise<void> {
	await request(`/friends/${targetId}/unblock`, userId, campusId, "POST");
}

export async function removeFriend(
	userId: string,
	campusId: string | null,
	targetId: string,
): Promise<void> {
	await request(`/friends/${targetId}/remove`, userId, campusId, "POST");
}

