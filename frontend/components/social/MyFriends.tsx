"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

import { MessageCircle, UserX } from "lucide-react";

import { getDemoCampusId, getDemoUserId } from "@/lib/env";
import { getSocialSocket } from "@/lib/socket";
import { fetchFriends, removeFriend } from "@/lib/social";
import type { FriendRow } from "@/lib/types";
import { onAuthChange, readAuthUser, type AuthUser } from "@/lib/auth-storage";

const DEMO_USER_ID = getDemoUserId();
const DEMO_CAMPUS_ID = getDemoCampusId();

function friendPrimaryLabel(friend: FriendRow): string {
    return friend.friend_display_name ?? friend.friend_handle ?? friend.friend_id;
}

function friendSecondaryLabel(friend: FriendRow): string {
    if (friend.friend_handle) {
        return `@${friend.friend_handle}`;
    }
    return friend.friend_id;
}

export function MyFriends() {
    const router = useRouter();
    const [friends, setFriends] = useState<FriendRow[]>([]);
    const [loading, setLoading] = useState<boolean>(true);
    const [error, setError] = useState<string | null>(null);
    const [authUser, setAuthUser] = useState<AuthUser | null>(null);

    const currentUserId = authUser?.userId ?? DEMO_USER_ID;
    const currentCampusId = authUser?.campusId ?? DEMO_CAMPUS_ID;

    useEffect(() => {
        setAuthUser(readAuthUser());
        const cleanup = onAuthChange(() => setAuthUser(readAuthUser()));
        return cleanup;
    }, []);

    const loadFriends = useCallback(async () => {
        try {
            setLoading(true);
            const rows = await fetchFriends(currentUserId, currentCampusId, "accepted");
            setFriends(rows);
            setError(null);
        } catch (err) {
            setError(err instanceof Error ? err.message : "Unable to load friends");
        } finally {
            setLoading(false);
        }
    }, [currentUserId, currentCampusId]);

    useEffect(() => {
        void loadFriends();
    }, [loadFriends]);

    const socket = useMemo(() => getSocialSocket(currentUserId, currentCampusId), [currentUserId, currentCampusId]);

    useEffect(() => {
        const handleUpdate = () => {
            void loadFriends();
        };
        socket.on("friend:update", handleUpdate);
        socket.emit("subscribe_self");
        return () => {
            socket.off("friend:update", handleUpdate);
        };
    }, [socket, loadFriends]);

    const handleRemoveFriend = async (friendId: string, friendName: string) => {
        if (!confirm(`Are you sure you want to remove ${friendName} as a friend?`)) {
            return;
        }

        try {
            await removeFriend(currentUserId, currentCampusId, friendId);
            setFriends(prev => prev.filter(f => f.friend_id !== friendId));
        } catch (err) {
            console.error("Failed to remove friend:", err);
            alert("Failed to remove friend. Please try again.");
        }
    };

    if (loading) return <div className="p-8 text-center text-slate-500">Loading friends...</div>;
    if (error) return <div className="p-8 text-center text-rose-500">{error}</div>;

    return (
        <div className="bg-white dark:bg-slate-900 rounded-3xl p-6 shadow-sm border border-slate-100 dark:border-slate-800">
            <h3 className="text-xl font-bold text-slate-900 dark:text-white mb-6">My Friends ({friends.length})</h3>

            {friends.length === 0 ? (
                <div className="text-center py-8 text-slate-500 dark:text-slate-400">
                    You haven&apos;t added any friends yet. Go to <span className="font-bold text-indigo-500">Discover</span> to find people!
                </div>
            ) : (
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                    {friends.map((friend) => (
                        <div key={friend.friend_id} className="flex items-center justify-between p-4 rounded-2xl bg-slate-50 dark:bg-slate-800 border border-slate-100 dark:border-slate-700">
                            <div className="flex items-center gap-3">
                                <div className="h-10 w-10 rounded-full bg-indigo-100 flex items-center justify-center text-indigo-600 font-bold shrink-0">
                                    {friendPrimaryLabel(friend)[0]?.toUpperCase()}
                                </div>
                                <div className="overflow-hidden">
                                    <p className="font-bold text-slate-900 dark:text-slate-100 truncate">{friendPrimaryLabel(friend)}</p>
                                    <p className="text-xs text-slate-500 dark:text-slate-400 truncate">{friendSecondaryLabel(friend)}</p>
                                </div>
                            </div>
                            <div className="flex gap-2">
                                <button
                                    onClick={() => router.push(`/chat/${friend.friend_id}`)}
                                    className="h-8 w-8 flex items-center justify-center rounded-full bg-indigo-100 text-indigo-600 hover:bg-indigo-200 transition"
                                    title="Message"
                                >
                                    <MessageCircle size={16} />
                                </button>
                                <button
                                    onClick={() => handleRemoveFriend(friend.friend_id, friendPrimaryLabel(friend))}
                                    className="h-8 w-8 flex items-center justify-center rounded-full bg-slate-200 text-slate-600 hover:bg-rose-100 hover:text-rose-600 transition"
                                    title="Remove Friend"
                                >
                                    <UserX size={16} />
                                </button>
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}
