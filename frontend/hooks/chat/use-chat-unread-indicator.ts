"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import { onAuthChange, readAuthUser, type AuthUser } from "@/lib/auth-storage";
import { getBackendUrl, getDemoCampusId, getDemoUserId } from "@/lib/env";
import {
	acknowledgeAllConversations,
	acknowledgeConversation,
	bindChatUnreadSocket,
	clearUnreadState,
	getUnreadCounts,
	setActiveChatPeer,
	subscribeUnreadCounts,
} from "@/lib/chat/unread-manager";

type CountsMap = Record<string, number>;

const SOCKET_BASE_URL = process.env.NEXT_PUBLIC_SOCKET_URL ?? getBackendUrl();

export type ChatUnreadIndicator = {
	totalUnread: number;
	counts: CountsMap;
	authUser: AuthUser | null;
	acknowledgePeer: (peerId: string) => void;
	acknowledgeAll: () => void;
};

export function useChatUnreadIndicator(): ChatUnreadIndicator {
	const [authUser, setAuthUser] = useState<AuthUser | null>(null);
	const [counts, setCounts] = useState<CountsMap>(() => getUnreadCounts());

	useEffect(() => {
		setAuthUser(readAuthUser());
		const unsubscribe = onAuthChange(() => {
			setAuthUser(readAuthUser());
		});
		return unsubscribe;
	}, []);

	useEffect(() => {
		return subscribeUnreadCounts((next) => {
			setCounts(next);
		});
	}, []);

	useEffect(() => {
		const userId = authUser?.userId ?? null;
		const campusId = authUser?.campusId ?? null;
		if (!userId || !campusId) {
			clearUnreadState();
			return;
		}
		bindChatUnreadSocket(SOCKET_BASE_URL, userId, campusId);
		return () => {
			setActiveChatPeer(null);
		};
	}, [authUser?.userId, authUser?.campusId]);

	const totalUnread = useMemo(
		() => Object.values(counts).reduce((sum, value) => sum + value, 0),
		[counts],
	);

	const acknowledgePeer = useCallback((peerId: string) => {
		acknowledgeConversation(peerId);
	}, []);

	const acknowledgeAll = useCallback(() => {
		acknowledgeAllConversations();
	}, []);

	return useMemo(
		() => ({
			totalUnread,
			counts,
			authUser,
			acknowledgePeer,
			acknowledgeAll,
		}),
		[acknowledgeAll, acknowledgePeer, authUser, counts, totalUnread],
	);
}

export function useDemoChatUnreadIndicator(): ChatUnreadIndicator {
	const [counts, setCounts] = useState<CountsMap>(() => getUnreadCounts());

	useEffect(() => subscribeUnreadCounts(setCounts), []);

	useEffect(() => {
		bindChatUnreadSocket(SOCKET_BASE_URL, getDemoUserId(), getDemoCampusId());
		return () => {
			setActiveChatPeer(null);
		};
	}, []);

	const totalUnread = useMemo(
		() => Object.values(counts).reduce((sum, value) => sum + value, 0),
		[counts],
	);

	return {
		totalUnread,
		counts,
		authUser: null,
		acknowledgePeer: acknowledgeConversation,
		acknowledgeAll: acknowledgeAllConversations,
	};
}
