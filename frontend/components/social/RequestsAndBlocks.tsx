"use client";

import { useCallback, useEffect, useState } from "react";

import { Check, Shield, Loader2 } from "lucide-react";
import {
    acceptInvite,
    cancelInvite,
    declineInvite,
    fetchInviteInbox,
    fetchInviteOutbox,
    fetchFriends,
    unblockUser,
} from "@/lib/social";
import { readAuthUser, onAuthChange, type AuthUser } from "@/lib/auth-storage";
import { getDemoUserId, getDemoCampusId } from "@/lib/env";
import { type InviteSummary, type FriendRow } from "@/lib/types";

const DEMO_USER_ID = getDemoUserId();
const DEMO_CAMPUS_ID = getDemoCampusId();

export function RequestsAndBlocks() {
    const [activeTab, setActiveTab] = useState<"requests" | "blocked">("requests");
    const [inbox, setInbox] = useState<InviteSummary[]>([]);
    const [outbox, setOutbox] = useState<InviteSummary[]>([]);
    const [blockedUsers, setBlockedUsers] = useState<FriendRow[]>([]);
    const [loading, setLoading] = useState(false);
    const [message, setMessage] = useState<string | null>(null);

    const [authUser, setAuthUser] = useState<AuthUser | null>(null);
    const currentUserId = authUser?.userId ?? DEMO_USER_ID;
    const currentCampusId = authUser?.campusId ?? DEMO_CAMPUS_ID;

    useEffect(() => {
        setAuthUser(readAuthUser());
        return onAuthChange(() => setAuthUser(readAuthUser()));
    }, []);

    const loadData = useCallback(async () => {
        if (activeTab === "requests") {
            setLoading(true);
            try {
                const [inboxData, outboxData] = await Promise.all([
                    fetchInviteInbox(currentUserId, currentCampusId),
                    fetchInviteOutbox(currentUserId, currentCampusId),
                ]);
                setInbox(inboxData);
                setOutbox(outboxData);
            } catch (err) {
                console.error("Failed requests load", err);
            } finally {
                setLoading(false);
            }
        } else {
            setLoading(true);
            try {
                const blocked = await fetchFriends(currentUserId, currentCampusId, "blocked");
                setBlockedUsers(blocked);
            } catch (err) {
                console.error("Failed blocked load", err);
            } finally {
                setLoading(false);
            }
        }
    }, [activeTab, currentUserId, currentCampusId]);

    useEffect(() => {
        void loadData();
    }, [loadData]);

    const handleAction = async (action: () => Promise<void>, msg: string) => {
        try {
            await action();
            setMessage(msg);
            void loadData();
            setTimeout(() => setMessage(null), 3000);
        } catch (err) {
            setMessage(err instanceof Error ? err.message : "Action failed");
        }
    };

    return (
        <div className="bg-white dark:bg-slate-900 rounded-3xl p-6 shadow-sm border border-slate-100 dark:border-slate-800">
            <div className="flex gap-4 border-b border-slate-100 dark:border-slate-800 pb-4 mb-6">
                <button
                    onClick={() => setActiveTab("requests")}
                    className={`text-sm font-bold pb-2 border-b-2 transition ${activeTab === "requests" ? "border-indigo-500 text-indigo-600" : "border-transparent text-slate-500 hover:text-slate-800"}`}
                >
                    Requests {inbox.length > 0 && <span className="ml-1 bg-rose-500 text-white px-1.5 py-0.5 rounded-full text-[10px]">{inbox.length}</span>}
                </button>
                <button
                    onClick={() => setActiveTab("blocked")}
                    className={`text-sm font-bold pb-2 border-b-2 transition ${activeTab === "blocked" ? "border-indigo-500 text-indigo-600" : "border-transparent text-slate-500 hover:text-slate-800"}`}
                >
                    Blocked Users
                </button>
            </div>

            {message && (
                <div className="mb-4 p-3 bg-emerald-50 text-emerald-700 text-sm rounded-xl font-medium flex items-center gap-2">
                    <Check size={14} /> {message}
                </div>
            )}

            {loading ? (
                <div className="py-12 flex justify-center"><Loader2 className="animate-spin text-slate-400" /></div>
            ) : activeTab === "requests" ? (
                <div className="space-y-8">
                    <section>
                        <h3 className="text-xs font-bold uppercase text-slate-400 mb-4 tracking-wider">Received ({inbox.length})</h3>
                        {inbox.length === 0 ? (
                            <div className="text-sm text-slate-500 italic">No pending requests.</div>
                        ) : (
                            <div className="space-y-3">
                                {inbox.map(req => (
                                    <div key={req.id} className="flex items-center justify-between p-4 rounded-2xl bg-slate-50 dark:bg-slate-800 border border-slate-100 dark:border-slate-700">
                                        <div>
                                            <p className="font-bold text-slate-900 dark:text-slate-100">{req.from_display_name || "User"}</p>
                                            <p className="text-xs text-slate-500 dark:text-slate-400">@{req.from_handle}</p>
                                        </div>
                                        <div className="flex gap-2">
                                            <button onClick={() => handleAction(() => acceptInvite(currentUserId, currentCampusId, req.id), "Accepted request")} className="px-3 py-1.5 bg-indigo-600 text-white rounded-lg text-xs font-bold hover:bg-indigo-700">Accept</button>
                                            <button onClick={() => handleAction(() => declineInvite(currentUserId, currentCampusId, req.id), "Declined request")} className="px-3 py-1.5 bg-slate-200 text-slate-600 rounded-lg text-xs font-bold hover:bg-slate-300">Decline</button>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </section>

                    {outbox.length > 0 && (
                        <section>
                            <h3 className="text-xs font-bold uppercase text-slate-400 mb-4 tracking-wider">Sent ({outbox.length})</h3>
                            <div className="space-y-3">
                                {outbox.map(req => (
                                    <div key={req.id} className="flex items-center justify-between p-4 rounded-2xl border border-slate-100 dark:border-slate-800 opacity-75">
                                        <div>
                                            <p className="font-bold text-slate-900 dark:text-slate-100">{req.to_display_name}</p>
                                            <p className="text-xs text-slate-500 dark:text-slate-400">@{req.to_handle}</p>
                                        </div>
                                        <button onClick={() => handleAction(() => cancelInvite(currentUserId, currentCampusId, req.id), "Cancelled request")} className="text-xs font-bold text-rose-500 hover:underline">Cancel</button>
                                    </div>
                                ))}
                            </div>
                        </section>
                    )}
                </div>
            ) : (
                <div>
                    {blockedUsers.length === 0 ? (
                        <div className="text-center py-12 text-slate-500">
                            <Shield className="mx-auto h-8 w-8 opacity-20 mb-3" />
                            <p>You haven&apos;t blocked anyone.</p>
                        </div>
                    ) : (
                        <div className="space-y-3">
                            {blockedUsers.map(user => (
                                <div key={user.friend_id} className="flex items-center justify-between p-4 rounded-2xl bg-white border border-slate-200">
                                    <div className="flex items-center gap-3">
                                        <div className="h-10 w-10 flex items-center justify-center bg-slate-100 rounded-full font-bold text-slate-500">
                                            {(user.friend_display_name || "?")[0]}
                                        </div>
                                        <div>
                                            <p className="font-bold text-slate-900">{user.friend_display_name}</p>
                                            <p className="text-xs text-rose-500 font-medium">Blocked</p>
                                        </div>
                                    </div>
                                    <button onClick={() => handleAction(() => unblockUser(currentUserId, currentCampusId, user.friend_id), "Unblocked user")} className="text-sm font-bold text-slate-500 hover:text-slate-900">Unblock</button>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}
