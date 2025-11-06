"use client";

import React, { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";

import BrandLogo from "@/components/BrandLogo";
import { FriendList, type FriendProfileState } from "@/components/FriendList";
import { InviteInbox } from "@/components/InviteInbox";

import { useFriendAcceptanceIndicator } from "@/hooks/social/use-friend-acceptance-indicator";
import { onAuthChange, readAuthUser, type AuthUser } from "@/lib/auth-storage";
import { getDemoCampusId, getDemoUserId } from "@/lib/env";
import { fetchPublicProfile } from "@/lib/profiles";
import {
	acceptInvite,
	blockUser,
	cancelInvite,
	declineInvite,
	fetchFriends,
	fetchInviteInbox,
	fetchInviteOutbox,
	removeFriend,
	unblockUser,
} from "@/lib/social";
import type { FriendRow, InviteSummary, PublicProfile } from "@/lib/types";

type FriendFilter = "accepted" | "blocked" | "pending";

// Minimal shape for InviteInbox profile enrichment map (optional feature)
type InboxProfileStub = { profile: PublicProfile | null; loading: boolean; error: string | null };

function FriendsPageInner() {
	const [authUser, setAuthUser] = useState<AuthUser | null>(null);
	const [filter, setFilter] = useState<FriendFilter>("accepted");
	const { hasNotification, acknowledge } = useFriendAcceptanceIndicator();

	// Friends state
	const [friends, setFriends] = useState<FriendRow[]>([]);
	const [friendsLoading, setFriendsLoading] = useState<boolean>(true);
	const [friendsError, setFriendsError] = useState<string | null>(null);

	// Pending invites state
	const [inbox, setInbox] = useState<InviteSummary[]>([]);
	const [outbox, setOutbox] = useState<InviteSummary[]>([]);
	const [pendingLoading, setPendingLoading] = useState<boolean>(false);
	const [pendingError, setPendingError] = useState<string | null>(null);

	// UI state
	const [selectedFriendId, setSelectedFriendId] = useState<string | null>(null);
	const [statusMessage, setStatusMessage] = useState<string | null>(null);

	// Profiles for FriendList (enrichment)
	const [friendProfiles, setFriendProfiles] = useState<Record<string, FriendProfileState>>({});
	const friendProfileCacheRef = useRef<Map<string, PublicProfile>>(new Map());
	const friendProfilesStateRef = useRef<Record<string, FriendProfileState>>({});
	// Per-invite profile enrichment for InviteInbox
	const [inviteProfileData, setInviteProfileData] = useState<Record<string, InboxProfileStub>>({});
	const inviteProfileCacheRef = useRef<Map<string, PublicProfile>>(new Map());
	const inviteProfilesStateRef = useRef<Record<string, InboxProfileStub>>({});

	useEffect(() => {
		friendProfilesStateRef.current = friendProfiles;
	}, [friendProfiles]);

	useEffect(() => {
		inviteProfilesStateRef.current = inviteProfileData;
	}, [inviteProfileData]);

	const searchParams = useSearchParams();

	const currentUserId = authUser?.userId ?? getDemoUserId();
	const currentCampusId = authUser?.campusId ?? getDemoCampusId();

	// Reflect URL filter when present (e.g., /friends?filter=pending)
	useEffect(() => {
		const raw = searchParams?.get("filter");
		if (raw === "accepted" || raw === "blocked" || raw === "pending") {
			setFilter(raw);
		}
	}, [searchParams]);

	// Read auth from storage and subscribe to changes
	useEffect(() => {
		setAuthUser(readAuthUser());
		const cleanup = onAuthChange(() => setAuthUser(readAuthUser()));
		return cleanup;
	}, []);

	useEffect(() => {
		if (hasNotification) {
			acknowledge();
		}
	}, [acknowledge, hasNotification]);

	const loadFriends = useCallback(async (status: Exclude<FriendFilter, "pending">) => {
		setFriendsLoading(true);
		setFriendsError(null);
		try {
			const rows = await fetchFriends(currentUserId, currentCampusId, status);
			setFriends(rows);
		} catch (err) {
			setFriendsError(err instanceof Error ? err.message : "Failed to load friends");
			setFriends([]);
		} finally {
			setFriendsLoading(false);
		}
	}, [currentUserId, currentCampusId]);

	const loadPending = useCallback(async () => {
		setPendingLoading(true);
		setPendingError(null);
		try {
			const [inboxRows, outboxRows] = await Promise.all([
				fetchInviteInbox(currentUserId, currentCampusId),
				fetchInviteOutbox(currentUserId, currentCampusId),
			]);
			setInbox(inboxRows);
			setOutbox(outboxRows);
		} catch (err) {
			setPendingError(err instanceof Error ? err.message : "Failed to load invites");
			setInbox([]);
			setOutbox([]);
		} finally {
			setPendingLoading(false);
		}
	}, [currentUserId, currentCampusId]);

	// Load data based on active filter
	useEffect(() => {
		if (filter === "pending") {
			void loadPending();
		} else {
			void loadFriends(filter);
		}
	}, [filter, loadFriends, loadPending]);

		// Fetch profiles for friends when viewing accepted list
		useEffect(() => {
			if (filter !== "accepted" || friends.length === 0) return;

			let aborted = false;
			const controllers: AbortController[] = [];

			const ensureFriendProfile = async (friend: FriendRow) => {
				const key = friend.friend_id;
				const existing = friendProfilesStateRef.current[key];
				if (existing?.loading || existing?.profile || existing?.error) {
					return;
				}
				const handle = (friend.friend_handle ?? "").trim();
				if (!handle) {
					setFriendProfiles((prev) => ({ ...prev, [key]: { profile: null, loading: false, error: null } }));
					return;
				}
				const cached = friendProfileCacheRef.current.get(handle);
				if (cached) {
					setFriendProfiles((prev) => ({ ...prev, [key]: { profile: cached, loading: false, error: null } }));
					return;
				}
				const ctrl = new AbortController();
				controllers.push(ctrl);
				setFriendProfiles((prev) => ({ ...prev, [key]: { profile: null, loading: true, error: null } }));
				try {
					const profile = await fetchPublicProfile(handle, { userId: currentUserId, campusId: currentCampusId, signal: ctrl.signal });
					if (aborted) return;
					friendProfileCacheRef.current.set(handle, profile);
					setFriendProfiles((prev) => ({ ...prev, [key]: { profile, loading: false, error: null } }));
				} catch (err) {
					if (aborted) return;
					const message = err instanceof Error ? err.message : "Failed to load profile";
					setFriendProfiles((prev) => ({ ...prev, [key]: { profile: null, loading: false, error: message } }));
				}
			};

			for (const f of friends) {
				void ensureFriendProfile(f);
			}

			return () => {
				aborted = true;
				for (const c of controllers) c.abort();
			};
		}, [filter, friends, currentUserId, currentCampusId]);

			// Fetch profiles for invites when viewing pending list
		useEffect(() => {
			if (filter !== "pending") return;

			let aborted = false;
			const controllers: AbortController[] = [];

				type Item = { id: string; handles: string[] };
				const items: Item[] = [
					// For inbox (incoming), prefer sender; fallback to recipient
					...inbox.map((x) => ({
						id: x.id,
						handles: [x.from_handle, x.to_handle].filter((h): h is string => typeof h === "string" && h.trim().length > 0),
					})),
					// For outbox (outgoing), prefer recipient; fallback to sender
					...outbox.map((x) => ({
						id: x.id,
						handles: [x.to_handle, x.from_handle].filter((h): h is string => typeof h === "string" && h.trim().length > 0),
					})),
				];

				const ensureInviteProfile = async (item: Item) => {
				const key = item.id;
					const existing = inviteProfilesStateRef.current[key];
					// If already successfully loaded, skip
					if (existing?.profile) return;
					// If currently loading, skip (request in-flight)
					if (existing?.loading) return;

					const candidates = item.handles.map((h) => h.trim().replace(/^@/, ""));
					if (candidates.length === 0) {
						setInviteProfileData((prev) => ({ ...prev, [key]: { profile: null, loading: false, error: null } }));
						return;
					}

					// Try candidates in order until one succeeds
					setInviteProfileData((prev) => ({ ...prev, [key]: { profile: null, loading: true, error: null } }));
					for (const handle of candidates) {
						const cached = inviteProfileCacheRef.current.get(handle);
						if (cached) {
							if (aborted) return;
							setInviteProfileData((prev) => ({ ...prev, [key]: { profile: cached, loading: false, error: null } }));
							return;
						}
						const ctrl = new AbortController();
						controllers.push(ctrl);
						try {
							const profile = await fetchPublicProfile(handle, { userId: currentUserId, campusId: currentCampusId, signal: ctrl.signal });
							if (aborted) return;
							inviteProfileCacheRef.current.set(handle, profile);
							setInviteProfileData((prev) => ({ ...prev, [key]: { profile, loading: false, error: null } }));
							return;
								} catch {
							if (aborted) return;
							// Try next candidate
							continue;
						}
					}
					// All candidates failed
					setInviteProfileData((prev) => ({ ...prev, [key]: { profile: null, loading: false, error: "" } }));
			};

			for (const it of items) {
				void ensureInviteProfile(it);
			}

			return () => {
				aborted = true;
				for (const c of controllers) c.abort();
			};
	}, [filter, inbox, outbox, currentUserId, currentCampusId]);

	// Friends actions
	const handleBlock = useCallback(async (userId: string) => {
		try {
			await blockUser(currentUserId, currentCampusId, userId);
			setStatusMessage("User blocked.");
			if (filter !== "pending") {
				await loadFriends(filter);
			}
		} catch (err) {
			setStatusMessage(err instanceof Error ? err.message : "Failed to block user");
		}
	}, [currentUserId, currentCampusId, filter, loadFriends]);

	const handleUnblock = useCallback(async (userId: string) => {
		try {
			await unblockUser(currentUserId, currentCampusId, userId);
			setStatusMessage("User unblocked.");
			if (filter !== "pending") {
				await loadFriends(filter);
			}
		} catch (err) {
			setStatusMessage(err instanceof Error ? err.message : "Failed to unblock user");
		}
	}, [currentUserId, currentCampusId, filter, loadFriends]);

	const handleRemove = useCallback(async (userId: string) => {
		try {
			await removeFriend(currentUserId, currentCampusId, userId);
			setStatusMessage("Friend removed.");
			if (filter !== "pending") {
				await loadFriends(filter);
			}
		} catch (err) {
			setStatusMessage(err instanceof Error ? err.message : "Failed to remove friend");
		}
	}, [currentUserId, currentCampusId, filter, loadFriends]);

	const handleChat = useCallback((userId: string) => {
		// Wire to chat route if available
		console.debug("Open chat with:", userId);
	}, []);

	// Invite actions
	const handleAccept = useCallback(async (inviteId: string) => {
		try {
			await acceptInvite(currentUserId, currentCampusId, inviteId);
			setStatusMessage("Invite accepted — new friend added.");
			await loadPending();
			if (filter !== "pending") {
				await loadFriends(filter);
			}
		} catch (err) {
			setStatusMessage(err instanceof Error ? err.message : "Failed to accept invite");
		}
	}, [currentUserId, currentCampusId, filter, loadFriends, loadPending]);

	const handleDecline = useCallback(async (inviteId: string) => {
		try {
			await declineInvite(currentUserId, currentCampusId, inviteId);
			setStatusMessage("Invite declined.");
			await loadPending();
		} catch (err) {
			setStatusMessage(err instanceof Error ? err.message : "Failed to decline invite");
		}
	}, [currentUserId, currentCampusId, loadPending]);

	const handleCancel = useCallback(async (inviteId: string) => {
		try {
			await cancelInvite(currentUserId, currentCampusId, inviteId);
			setStatusMessage("Invite cancelled.");
			await loadPending();
		} catch (err) {
			setStatusMessage(err instanceof Error ? err.message : "Failed to cancel invite");
		}
	}, [currentUserId, currentCampusId, loadPending]);

	const pendingContent = useMemo(() => (
		<div className="flex flex-col gap-3">
			{statusMessage ? (
				<div className="rounded border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
					{statusMessage}
				</div>
			) : null}
			<InviteInbox
				inbox={inbox}
				outbox={outbox}
				loading={pendingLoading}
				error={pendingError}
				onAccept={handleAccept}
				onDecline={handleDecline}
				onCancel={handleCancel}
				profileData={inviteProfileData}
			/>
		</div>
	), [handleAccept, handleCancel, handleDecline, inbox, outbox, pendingError, pendingLoading, statusMessage, inviteProfileData]);

	return (
		<div className="mx-auto max-w-2xl px-3 py-6">
			<header className="mb-6 flex items-center justify-between">
				<BrandLogo logoWidth={56} logoHeight={56} withWordmark={false} />
				<Link href="/chat" className="text-sm font-semibold text-coral hover:text-coral/80">
					Open chats →
				</Link>
			</header>
			<div className="mb-4 text-xl font-semibold text-slate-900">Friends</div>
			{statusMessage && filter !== "pending" ? (
				<div className="mb-3 rounded border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
					{statusMessage}
				</div>
			) : null}
			<FriendList
				friends={friends}
				filter={filter}
				onChangeFilter={setFilter}
				onBlock={handleBlock}
				onUnblock={handleUnblock}
				onRemove={handleRemove}
				onChat={handleChat}
						profileData={friendProfiles}
				onSelect={setSelectedFriendId}
				selectedFriendId={selectedFriendId}
				pendingContent={pendingContent}
			/>
			{friendsError && filter !== "pending" ? (
				<p className="mt-3 text-sm text-rose-700">{friendsError}</p>
			) : null}
			{friendsLoading && filter !== "pending" ? (
				<p className="mt-3 text-sm text-slate-500">Loading…</p>
			) : null}
		</div>
	);
}

export default function FriendsPage() {
	return (
		<Suspense fallback={<div className="mx-auto max-w-2xl px-3 py-6 text-sm text-slate-500">Loading friends…</div>}>
			<FriendsPageInner />
		</Suspense>
	);
}
