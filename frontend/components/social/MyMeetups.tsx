"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Users, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { listMeetups, joinMeetup, updateMeetup, MeetupResponse, MeetupCategory, MeetupVisibility } from "@/lib/meetups";
import { readAuthUser } from "@/lib/auth-storage";
import { MeetupCard, MEETUP_CATEGORIES } from "@/components/MeetupCard";

export function MyMeetups() {
    const authUser = readAuthUser();
    const queryClient = useQueryClient();
    const [filter, setFilter] = useState<"all" | "hosting" | "joined">("all");
    const [timeFilter, setTimeFilter] = useState<"upcoming" | "past">("upcoming");
    const [editingMeetup, setEditingMeetup] = useState<MeetupResponse | null>(null);

    const { data: meetups, isLoading } = useQuery({
        queryKey: ["meetups", authUser?.campusId, "my", authUser?.userId],
        queryFn: () => listMeetups(authUser?.campusId ?? undefined, undefined, undefined, undefined, authUser?.userId),
        enabled: !!authUser?.campusId && !!authUser?.userId,
    });

    const joinMutation = useMutation({
        mutationFn: joinMeetup,
        onSuccess: () => queryClient.invalidateQueries({ queryKey: ["meetups"] }),
        onError: () => alert("Failed to join meetup. Please try again.")
    });

    const editMutation = useMutation({
        mutationFn: (data: { id: string; payload: Record<string, unknown> }) => updateMeetup(data.id, data.payload),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["meetups"] });
            setEditingMeetup(null);
        },
        onError: (err: { response?: { data?: { detail?: string } } }) => alert(err?.response?.data?.detail || "Failed to update meetup.")
    });

    if (!authUser) return null;

    const now = new Date();
    const myMeetups = meetups?.filter((meetup: MeetupResponse) => {
        // First, apply role filter
        const isHost = meetup.creator_user_id === authUser.userId;
        const isJoined = meetup.is_joined;

        if (!isHost && !isJoined) return false;

        if (filter === "hosting") if (!isHost) return false;
        if (filter === "joined") if (!isJoined || isHost) return false;

        // Then, apply time filter
        const startDate = new Date(meetup.start_at);
        const duration = meetup.duration_min;
        const endDate = new Date(startDate.getTime() + duration * 60000);

        if (timeFilter === "upcoming") {
            return endDate > now;
        } else {
            return endDate <= now;
        }
    });

    const handleEditSubmit = (e: React.FormEvent<HTMLFormElement>) => {
        e.preventDefault();
        if (!editingMeetup) return;

        const formData = new FormData(e.currentTarget);
        const startAt = new Date(formData.get("start_at") as string).toISOString();

        editMutation.mutate({
            id: editingMeetup.id,
            payload: {
                title: formData.get("title") as string,
                description: formData.get("description") as string,
                location: formData.get("location") as string,
                category: formData.get("category") as MeetupCategory,
                start_at: startAt,
                duration_min: Number(formData.get("duration_min")),
                visibility: formData.get("visibility") as MeetupVisibility,
                capacity: Number(formData.get("capacity")),
            }
        });
    };

    return (
        <div className="space-y-6">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between bg-white p-4 rounded-[32px] border border-slate-100 shadow-sm">
                <div className="flex gap-1 bg-slate-100 p-1 rounded-2xl w-fit">
                    <button
                        onClick={() => setFilter("all")}
                        className={cn(
                            "px-5 py-2 rounded-xl text-xs font-bold transition-all",
                            filter === "all" ? "bg-white text-indigo-600 shadow-sm" : "text-slate-500 hover:text-slate-800"
                        )}
                    >
                        All
                    </button>
                    <button
                        onClick={() => setFilter("hosting")}
                        className={cn(
                            "px-5 py-2 rounded-xl text-xs font-bold transition-all",
                            filter === "hosting" ? "bg-white text-indigo-600 shadow-sm" : "text-slate-500 hover:text-slate-800"
                        )}
                    >
                        Hosting
                    </button>
                    <button
                        onClick={() => setFilter("joined")}
                        className={cn(
                            "px-5 py-2 rounded-xl text-xs font-bold transition-all",
                            filter === "joined" ? "bg-white text-indigo-600 shadow-sm" : "text-slate-500 hover:text-slate-800"
                        )}
                    >
                        Joined
                    </button>
                </div>

                <div className="flex gap-1 bg-slate-100 p-1 rounded-2xl w-fit">
                    <button
                        onClick={() => setTimeFilter("upcoming")}
                        className={cn(
                            "px-5 py-2 rounded-xl text-xs font-bold transition-all",
                            timeFilter === "upcoming" ? "bg-white text-indigo-600 shadow-sm" : "text-slate-500 hover:text-slate-800"
                        )}
                    >
                        Upcoming
                    </button>
                    <button
                        onClick={() => setTimeFilter("past")}
                        className={cn(
                            "px-5 py-2 rounded-xl text-xs font-bold transition-all",
                            timeFilter === "past" ? "bg-white text-indigo-600 shadow-sm" : "text-slate-500 hover:text-slate-800"
                        )}
                    >
                        Past
                    </button>
                </div>
            </div>

            {isLoading ? (
                <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
                    {[1, 2, 3].map(i => <div key={i} className="h-64 bg-slate-200 animate-pulse rounded-[32px]" />)}
                </div>
            ) : myMeetups?.length === 0 ? (
                <div className="text-center py-20 bg-white rounded-[32px] border border-slate-100 shadow-sm">
                    <div className="mx-auto h-20 w-20 rounded-full bg-slate-50 flex items-center justify-center text-slate-300 mb-4">
                        <Users className="h-10 w-10" />
                    </div>
                    <h3 className="text-xl font-bold text-slate-900">No {timeFilter} meetups found</h3>
                    <p className="text-slate-500 mt-2">
                        {filter === 'hosting' ? "You aren't hosting any " + timeFilter + " meetups." :
                            filter === 'joined' ? "You haven't joined any " + timeFilter + " meetups." :
                                "You haven't joined or created any " + timeFilter + " meetups yet."}
                    </p>
                </div>
            ) : (
                <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                    {myMeetups?.map((meetup: MeetupResponse) => (
                        <MeetupCard
                            key={meetup.id}
                            meetup={meetup}
                            onJoin={(id) => joinMutation.mutate(id)}
                            onEdit={(m) => setEditingMeetup(m)}
                        />
                    ))}
                </div>
            )}

            {/* Edit Modal */}
            {editingMeetup && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4 backdrop-blur-sm animate-in fade-in duration-200">
                    <div className="w-full max-w-lg rounded-[32px] bg-white p-8 shadow-2xl animate-in zoom-in-95 duration-200 max-h-[90vh] overflow-y-auto">
                        <div className="flex items-center justify-between mb-6">
                            <h2 className="text-2xl font-bold text-slate-900">Edit Meetup</h2>
                            <button onClick={() => setEditingMeetup(null)} className="p-2 hover:bg-slate-100 rounded-full transition-colors">
                                <X className="h-5 w-5 text-slate-500" />
                            </button>
                        </div>

                        <form onSubmit={handleEditSubmit} className="space-y-5">
                            <div className="space-y-1.5">
                                <label className="text-xs font-bold uppercase tracking-wider text-slate-500">Title</label>
                                <input name="title" required defaultValue={editingMeetup.title} className="w-full rounded-2xl border-slate-200 bg-slate-50 px-4 py-3 font-semibold focus:border-indigo-500 focus:ring-indigo-200" />
                            </div>

                            <div className="space-y-1.5">
                                <label className="text-xs font-bold uppercase tracking-wider text-slate-500">Location</label>
                                <input name="location" defaultValue={editingMeetup.location} className="w-full rounded-2xl border-slate-200 bg-slate-50 px-4 py-3 font-semibold focus:border-indigo-500 focus:ring-indigo-200" />
                            </div>

                            <div className="grid grid-cols-2 gap-4">
                                <div className="space-y-1.5">
                                    <label className="text-xs font-bold uppercase tracking-wider text-slate-500">Category</label>
                                    <select name="category" defaultValue={editingMeetup.category} className="w-full rounded-2xl border-slate-200 bg-slate-50 px-4 py-3 font-semibold focus:border-indigo-500 focus:ring-indigo-200">
                                        {MEETUP_CATEGORIES.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
                                    </select>
                                </div>
                                <div className="space-y-1.5">
                                    <label className="text-xs font-bold uppercase tracking-wider text-slate-500">Start Time</label>
                                    <input type="datetime-local" name="start_at" required defaultValue={new Date(new Date(editingMeetup.start_at).getTime() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 16)} className="w-full rounded-2xl border-slate-200 bg-slate-50 px-4 py-3 font-semibold focus:border-indigo-500 focus:ring-indigo-200" />
                                </div>
                            </div>

                            <div className="grid grid-cols-2 gap-4">
                                <div className="space-y-1.5">
                                    <label className="text-xs font-bold uppercase tracking-wider text-slate-500">Duration (min)</label>
                                    <input type="number" name="duration_min" defaultValue={editingMeetup.duration_min} min={15} className="w-full rounded-2xl border-slate-200 bg-slate-50 px-4 py-3 font-semibold focus:border-indigo-500 focus:ring-indigo-200" />
                                </div>
                                <div className="space-y-1.5">
                                    <label className="text-xs font-bold uppercase tracking-wider text-slate-500">Capacity</label>
                                    <input type="number" name="capacity" defaultValue={editingMeetup.capacity} min={editingMeetup.participants_count} className="w-full rounded-2xl border-slate-200 bg-slate-50 px-4 py-3 font-semibold focus:border-indigo-500 focus:ring-indigo-200" />
                                </div>
                            </div>

                            <div className="space-y-1.5">
                                <label className="text-xs font-bold uppercase tracking-wider text-slate-500">Visibility</label>
                                <div className="grid grid-cols-3 gap-3">
                                    <label className="cursor-pointer">
                                        <input type="radio" name="visibility" value="FRIENDS" defaultChecked={editingMeetup.visibility === 'FRIENDS'} className="peer sr-only" />
                                        <div className="rounded-xl border-2 border-slate-200 bg-slate-50 px-2 py-3 text-center text-[10px] font-bold text-slate-400 peer-checked:border-indigo-500 peer-checked:bg-indigo-50 peer-checked:text-indigo-600 transition-all">
                                            Friends
                                        </div>
                                    </label>
                                    <label className="cursor-pointer">
                                        <input type="radio" name="visibility" value="CAMPUS" defaultChecked={editingMeetup.visibility === 'CAMPUS'} className="peer sr-only" />
                                        <div className="rounded-xl border-2 border-slate-200 bg-slate-50 px-2 py-3 text-center text-[10px] font-bold text-slate-400 peer-checked:border-indigo-500 peer-checked:bg-indigo-50 peer-checked:text-indigo-600 transition-all">
                                            Campus
                                        </div>
                                    </label>
                                    <label className="cursor-pointer">
                                        <input type="radio" name="visibility" value="CITY" defaultChecked={editingMeetup.visibility === 'CITY'} className="peer sr-only" />
                                        <div className="rounded-xl border-2 border-slate-200 bg-slate-50 px-2 py-3 text-center text-[10px] font-bold text-slate-400 peer-checked:border-emerald-500 peer-checked:bg-emerald-50 peer-checked:text-emerald-600 transition-all">
                                            City
                                        </div>
                                    </label>
                                </div>
                            </div>

                            <div className="flex gap-3 pt-4">
                                <button type="button" onClick={() => setEditingMeetup(null)} className="flex-1 rounded-xl bg-slate-100 py-3.5 font-bold text-slate-600 hover:bg-slate-200 transition-all">Cancel</button>
                                <button type="submit" disabled={editMutation.isPending} className="flex-1 rounded-xl bg-[#4f46e5] py-3.5 font-bold text-white hover:bg-indigo-700 shadow-lg shadow-indigo-200/50 disabled:opacity-50 transition-all">
                                    {editMutation.isPending ? "Saving..." : "Save Changes"}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
}
