import { apiFetch, type ApiFetchOptions } from "@/app/lib/http/client";
import { getBackendUrl } from "./env";
import type { FriendRow, InviteSummary } from "./types";

const BASE_URL = getBackendUrl();

async function request<T>(
	path: string,
	userId: string,
	campusId: string | null,
	options: ApiFetchOptions = {},
): Promise<T> {
	const { headers: initHeaders, method, ...rest } = options;
	return apiFetch<T>(`${BASE_URL}${path}`, {
		...rest,
		method: method ?? "GET",
		headers: {
			"X-User-Id": userId,
			...(campusId ? { "X-Campus-Id": campusId } : {}),
			...(initHeaders ?? {}),
		},
	});
}

type SendInviteOptions = {
	campus_id?: string | null;
	note?: string | null;
	idemKey?: string;
};

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
	options: SendInviteOptions = {},
): Promise<InviteSummary> {
	const { campus_id, note, idemKey } = options;
	return request<InviteSummary>("/invites/send", userId, campusId, {
		method: "POST",
		body: {
			to_user_id: toUserId,
			campus_id: campus_id ?? campusId,
			note: note ?? undefined,
		},
		idemKey,
	});
}

export async function acceptInvite(
	userId: string,
	campusId: string | null,
	inviteId: string,
): Promise<InviteSummary> {
	return request<InviteSummary>(`/invites/${inviteId}/accept`, userId, campusId, { method: "POST" });
}

export async function declineInvite(
	userId: string,
	campusId: string | null,
	inviteId: string,
): Promise<InviteSummary> {
	return request<InviteSummary>(`/invites/${inviteId}/decline`, userId, campusId, { method: "POST" });
}

export async function cancelInvite(
	userId: string,
	campusId: string | null,
	inviteId: string,
): Promise<InviteSummary> {
	return request<InviteSummary>(`/invites/${inviteId}/cancel`, userId, campusId, { method: "POST" });
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
	return request<FriendRow>(`/friends/${targetId}/block`, userId, campusId, { method: "POST" });
}

export async function unblockUser(
	userId: string,
	campusId: string | null,
	targetId: string,
): Promise<void> {
	await request(`/friends/${targetId}/unblock`, userId, campusId, { method: "POST" });
}

export async function removeFriend(
	userId: string,
	campusId: string | null,
	targetId: string,
): Promise<void> {
	await request(`/friends/${targetId}/remove`, userId, campusId, { method: "POST" });
}

export type Notification = {
	id: string;
	user_id: string;
	title: string;
	body: string;
	kind: string;
	link?: string;
	read_at?: string;
	created_at: string;
};

export async function fetchNotifications(userId: string, campusId: string | null): Promise<Notification[]> {
	return request<Notification[]>("/notifications", userId, campusId);
}

export async function markNotificationRead(userId: string, campusId: string | null, notificationId: string): Promise<void> {
	await request(`/notifications/${notificationId}/read`, userId, campusId, { method: "POST" });
}


