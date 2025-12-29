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

import { HttpError } from "@/app/lib/http/errors";

export async function fetchFriends(
	userId: string,
	campusId: string | null,
	filter: "accepted" | "blocked" | "pending" = "accepted",
): Promise<FriendRow[]> {
	try {
		return await request<FriendRow[]>(`/friends/list?filter=${filter}`, userId, campusId);
	} catch (err) {
		if (err instanceof HttpError && err.status === 404) {
			return [];
		}
		throw err;
	}
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

type NotificationUnreadResponse = {
	unread: number;
};

export async function fetchNotifications(
	userId: string,
	campusId: string | null,
	limit?: number,
): Promise<Notification[]> {
	const params = new URLSearchParams();
	if (typeof limit === "number") {
		params.set("limit", String(limit));
	}
	const suffix = params.toString();
	const path = suffix ? `/notifications?${suffix}` : "/notifications";
	return request<Notification[]>(path, userId, campusId);
}

export async function markNotificationRead(userId: string, campusId: string | null, notificationId: string): Promise<void> {
	await request(`/notifications/${notificationId}/read`, userId, campusId, { method: "POST" });
}

export async function fetchNotificationUnreadCount(userId: string, campusId: string | null): Promise<number> {
	const response = await request<NotificationUnreadResponse>("/notifications/unread", userId, campusId);
	return typeof response.unread === "number" ? response.unread : 0;
}

export type SocialUsage = {
	daily_limit: number;
	daily_usage: number;
};

export async function fetchSocialUsage(userId: string, campusId: string | null): Promise<SocialUsage> {
	return request<SocialUsage>("/usage", userId, campusId);
}
