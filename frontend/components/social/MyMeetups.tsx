"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Users } from "lucide-react";
import { listMeetups, joinMeetup } from "@/lib/meetups";
import { readAuthUser } from "@/lib/auth-storage";
import { MeetupCard } from "@/components/MeetupCard";

export function MyMeetups() {
    const authUser = readAuthUser();
    const queryClient = useQueryClient();
    const [filter, setFilter] = useState<"all" | "hosting" | "joined">("all");

    const { data: meetups, isLoading } = useQuery({
        queryKey: ["meetups", authUser?.campusId],
        queryFn: () => listMeetups(authUser?.campusId ?? undefined),
        enabled: !!authUser?.campusId,
    });

    const joinMutation = useMutation({
        mutationFn: joinMeetup,
        onSuccess: () => queryClient.invalidateQueries({ queryKey: ["meetups"] }),
        onError: () => alert("Failed to join meetup. Please try again.")
    });

    if (!authUser) return null;

    const myMeetups = meetups?.filter((meetup) => {
        const isHost = meetup.creator_user_id === authUser.userId;
        const isJoined = meetup.is_joined;

        // "Manage meetups that the user created as host or join"
        // So we primarily show these.
        if (!isHost && !isJoined) return false;

        if (filter === "hosting") return isHost;
        if (filter === "joined") return isJoined;
        return true; // "all" means all my relevant meetups
    });

    return (
        <div className="space-y-6">
            <div className="flex gap-2">
                <button
                    onClick={() => setFilter("all")}
                    className={`px-4 py-2 rounded-xl text-sm font-bold transition ${filter === "all" ? "bg-indigo-600 text-white" : "bg-white text-slate-600 hover:bg-slate-50"}`}
                >
                    All My Meetups
                </button>
                <button
                    onClick={() => setFilter("hosting")}
                    className={`px-4 py-2 rounded-xl text-sm font-bold transition ${filter === "hosting" ? "bg-indigo-600 text-white" : "bg-white text-slate-600 hover:bg-slate-50"}`}
                >
                    Hosting
                </button>
                <button
                    onClick={() => setFilter("joined")}
                    className={`px-4 py-2 rounded-xl text-sm font-bold transition ${filter === "joined" ? "bg-indigo-600 text-white" : "bg-white text-slate-600 hover:bg-slate-50"}`}
                >
                    Joined
                </button>
            </div>

            {isLoading ? (
                <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
                    {[1, 2, 3].map(i => <div key={i} className="h-64 bg-slate-200 animate-pulse rounded-3xl" />)}
                </div>
            ) : myMeetups?.length === 0 ? (
                <div className="text-center py-12 bg-white rounded-3xl border border-slate-100">
                    <div className="mx-auto h-16 w-16 rounded-full bg-slate-100 flex items-center justify-center text-slate-400 mb-4">
                        <Users className="h-8 w-8" />
                    </div>
                    <h3 className="text-lg font-bold text-slate-900">No meetups found</h3>
                    <p className="text-slate-500 dark:text-slate-400">You haven&apos;t joined any meetups yet.</p>
                </div>
            ) : (
                <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                    {myMeetups?.map((meetup) => (
                        <MeetupCard key={meetup.id} meetup={meetup} onJoin={(id) => joinMutation.mutate(id)} />
                    ))}
                </div>
            )}
        </div>
    );
}
