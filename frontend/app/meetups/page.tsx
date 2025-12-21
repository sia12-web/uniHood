"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Plus, Calendar, Clock, MapPin, Users, BookOpen,
  Dumbbell, Utensils, Gamepad2, ArrowRight
} from "lucide-react";
import { listMeetups, createMeetup, joinMeetup, MeetupCategory, MeetupResponse, MeetupVisibility } from "@/lib/meetups";
import { readAuthUser } from "@/lib/auth-storage";
import { cn } from "@/lib/utils";

// Category definitions with styling matching the design
const CATEGORIES = [
  { label: "Study", value: "study" as MeetupCategory, icon: BookOpen, color: "text-purple-600", bg: "bg-purple-100", badgeBg: "bg-purple-100", badgeText: "text-purple-700" },
  { label: "Gym", value: "gym" as MeetupCategory, icon: Dumbbell, color: "text-slate-600", bg: "bg-white", badgeBg: "bg-slate-100", badgeText: "text-slate-700" },
  { label: "Food", value: "food" as MeetupCategory, icon: Utensils, color: "text-orange-600", bg: "bg-white", badgeBg: "bg-orange-100", badgeText: "text-orange-700" },
  { label: "Game", value: "game" as MeetupCategory, icon: Gamepad2, color: "text-indigo-600", bg: "bg-white", badgeBg: "bg-indigo-100", badgeText: "text-indigo-700" },
];

function MeetupCard({ meetup, onJoin }: { meetup: MeetupResponse; onJoin: (id: string) => void }) {
  const category = CATEGORIES.find((c) => c.value === meetup.category) || {
    label: "Other", icon: Users, color: "text-slate-600", bg: "bg-white", badgeBg: "bg-slate-100", badgeText: "text-slate-700"
  };
  const CategoryIcon = category.icon;

  const startDate = new Date(meetup.start_at);
  const dateStr = startDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });

  // Use real location
  const location = meetup.location || "Location TBD";

  const percentFull = Math.min(100, Math.max(0, (meetup.participants_count / meetup.capacity) * 100));

  return (
    <div className="group flex flex-col rounded-[32px] bg-white p-6 shadow-sm transition-all hover:shadow-xl border border-slate-100/50">
      {/* Header Badge */}
      <div className="flex items-start justify-between">
        <span className={cn("flex items-center gap-2 rounded-full px-4 py-1.5 text-xs font-bold uppercase tracking-wide", category.badgeBg, category.badgeText)}>
          <CategoryIcon className="h-4 w-4" />
          {category.label}
        </span>
      </div>

      {/* Title & Info */}
      <div className="mt-5 space-y-4">
        <h3 className="text-xl font-bold text-slate-900 group-hover:text-purple-600 transition-colors line-clamp-1">
          {meetup.title}
        </h3>

        <div className="space-y-2 text-sm text-slate-500 font-medium">
          <div className="flex items-center gap-3">
            <Calendar className="h-4 w-4 shrink-0 text-slate-400" />
            <span>{dateStr}</span>
          </div>
          <div className="flex items-center gap-3">
            <MapPin className="h-4 w-4 shrink-0 text-slate-400" />
            <span className="line-clamp-1">{location}</span>
          </div>
        </div>

        {/* Host Info */}
        <div className="flex items-center gap-3 pt-1">
          <div className="relative h-8 w-8 overflow-hidden rounded-full bg-slate-200 ring-2 ring-white">
            {meetup.creator_avatar_url ? (
              <Image src={meetup.creator_avatar_url} alt="Host" fill className="object-cover" />
            ) : (
              <div className="flex h-full w-full items-center justify-center bg-slate-300 text-xs font-bold text-slate-500">
                {meetup.creator_name?.[0]?.toUpperCase() || "H"}
              </div>
            )}
          </div>
          <span className="text-sm text-slate-600 font-medium">
            Hosted by: <span className="text-slate-900 font-semibold">{meetup.creator_name || "Community Member"}</span>
          </span>
        </div>
      </div>

      {/* Participants Progress */}
      <div className="mt-6 mb-6">
        <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">Participants</span>
        <div className="mt-2 h-2 w-full rounded-full bg-slate-100 overflow-hidden">
          <div
            className="h-full rounded-full bg-indigo-500 transition-all duration-500"
            style={{ width: `${percentFull}%` }}
          />
        </div>
        <div className="mt-2.5 flex items-center justify-between">
          <span className="text-sm font-semibold text-slate-700">{meetup.participants_count}/{meetup.capacity} joined</span>
          <div className="flex -space-x-2">
            {meetup.recent_participants_avatars?.map((avatar, i) => (
              <div key={i} className="relative h-6 w-6 overflow-hidden rounded-full border-2 border-white bg-slate-200">
                {avatar && <Image src={avatar} alt="Participant" fill className="object-cover" />}
              </div>
            ))}
            {/* Fallback empty circles if no avatars but count > 0 */}
            {(meetup.participants_count > (meetup.recent_participants_avatars?.length || 0)) && (
              <div className="flex h-6 w-6 items-center justify-center rounded-full border-2 border-white bg-slate-100 text-[9px] font-bold text-slate-500">
                +{meetup.participants_count - (meetup.recent_participants_avatars?.length || 0)}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Action Button */}
      <div className="mt-auto">
        <button
          onClick={() => meetup.is_joined ? null : onJoin(meetup.id)}
          disabled={meetup.is_joined || meetup.participants_count >= meetup.capacity}
          className={cn(
            "w-full rounded-xl py-3 text-sm font-bold text-white shadow-lg transition-all hover:-translate-y-0.5 hover:shadow-xl active:translate-y-0 disabled:cursor-not-allowed disabled:opacity-50 disabled:shadow-none",
            meetup.is_joined
              ? "bg-emerald-500 shadow-emerald-200 hover:bg-emerald-600"
              : "bg-[#4f46e5] shadow-sm hover:bg-indigo-700"
          )}
        >
          {meetup.is_joined ? "Joined Group" : meetup.participants_count >= meetup.capacity ? "Full" : "Join Group"}
        </button>
      </div>
    </div>
  );
}

export default function MeetupsPage() {
  const authUser = readAuthUser();
  const router = useRouter();
  const queryClient = useQueryClient();
  const [selectedCategory, setSelectedCategory] = useState<MeetupCategory | undefined>();
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => setMounted(true), []);

  const { data: meetups, isLoading } = useQuery({
    queryKey: ["meetups", authUser?.campusId, selectedCategory],
    queryFn: () => listMeetups(authUser?.campusId ?? undefined, selectedCategory),
    enabled: !!authUser?.campusId,
  });

  const joinMutation = useMutation({
    mutationFn: joinMeetup,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["meetups"] }),
    onError: (err) => alert("Failed to join meetup. Please try again.")
  });

  const createMutation = useMutation({
    mutationFn: createMeetup,
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["meetups"] });
      setIsCreateOpen(false);
    },
    onError: (error) => alert("Failed to create meetup.")
  });

  const handleCreate = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    const dateStr = formData.get("date") as string;
    const timeStr = formData.get("time") as string;

    // Simple date construction (MVP)
    const today = new Date();
    const targetDate = new Date();
    // In real app, parse "2024-01-01" etc from UI
    // Here we relied on previous logic which used day names, let's keep it simple for now or implement proper inputs
    // Reverting to native inputs for reliability in this Quick Fix

    // Actually let's just use the native datetime-local for robustness in the modal
    const startAt = new Date(formData.get("start_at") as string).toISOString();

    createMutation.mutate({
      title: formData.get("title") as string,
      description: formData.get("description") as string,
      location: formData.get("location") as string,
      category: formData.get("category") as MeetupCategory,
      start_at: startAt,
      duration_min: Number(formData.get("duration_min")),
      campus_id: authUser?.campusId ?? undefined,
      visibility: formData.get("visibility") as MeetupVisibility,
      capacity: Number(formData.get("capacity")),
    });
  };

  if (!mounted) return null;

  if (!authUser) {
    return <div className="flex h-screen items-center justify-center">Please log in.</div>;
  }

  return (
    <main className="min-h-screen bg-slate-50 dark:bg-slate-950 font-sans pb-12">
      <div className="mx-auto max-w-7xl px-4 py-6 md:px-8 space-y-8">

        {/* Header Section */}
        <div className="flex flex-col gap-8 md:flex-row md:items-center md:justify-between">
          <div className="space-y-2">
            <h1 className="text-4xl font-extrabold text-slate-900 tracking-tight">Meetups: Find Your Squad</h1>
            <p className="text-lg text-slate-500 font-medium">Join existing groups or create your own based on your interests.</p>
          </div>
          <button
            onClick={() => setIsCreateOpen(true)}
            className="group flex items-center gap-2 rounded-2xl bg-[#4f46e5] px-6 py-3.5 text-sm font-bold text-white shadow-sm transition-all hover:scale-105 hover:bg-indigo-700"
          >
            <Plus className="h-5 w-5" />
            Create Meetup
          </button>
        </div>

        {/* Filter Bar */}
        <div className="mt-10 flex flex-wrap gap-4">
          <button
            onClick={() => setSelectedCategory(undefined)}
            className={cn(
              "flex items-center gap-2 rounded-2xl px-8 py-3.5 text-sm font-bold shadow-sm transition-all hover:scale-105 hover:shadow-md",
              !selectedCategory
                ? "bg-purple-600 text-white shadow-sm ring-2 ring-transparent hover:bg-purple-700"
                : "bg-white text-slate-600 ring-1 ring-slate-200 hover:bg-slate-50"
            )}
          >
            All
          </button>

          {CATEGORIES.map((cat) => (
            <button
              key={cat.value}
              onClick={() => setSelectedCategory(cat.value)}
              className={cn(
                "flex items-center gap-2 rounded-2xl px-6 py-3.5 text-sm font-bold shadow-sm transition-all hover:scale-105 hover:shadow-md",
                selectedCategory === cat.value
                  ? "bg-purple-600 text-white shadow-purple-200 ring-2 ring-transparent"
                  : "bg-white text-slate-600 ring-1 ring-slate-200 hover:bg-slate-50"
              )}
            >
              <cat.icon className={cn("h-4 w-4", selectedCategory === cat.value ? "text-white" : cat.color)} />
              {cat.label}
            </button>
          ))}
        </div>

        {/* Grid */}
        <div className="mt-10 grid gap-6 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {isLoading ? (
            Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="h-[400px] rounded-[32px] bg-white animate-pulse shadow-sm" />
            ))
          ) : meetups?.length === 0 ? (
            <div className="col-span-full py-20 text-center">
              <div className="mx-auto h-24 w-24 rounded-full bg-slate-100 flex items-center justify-center text-slate-400">
                <Users className="h-10 w-10" />
              </div>
              <h3 className="mt-4 text-xl font-bold text-slate-900">No meetups found</h3>
              <p className="text-slate-500">Try changing filters or create a new one!</p>
            </div>
          ) : (
            meetups?.map((meetup) => (
              <MeetupCard key={meetup.id} meetup={meetup} onJoin={(id) => joinMutation.mutate(id)} />
            ))
          )}
        </div>
      </div>

      {/* Simple Modal for MVP - reused styling */}
      {isCreateOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="w-full max-w-lg rounded-[32px] bg-white p-8 shadow-2xl animate-in zoom-in-95 duration-200">
            <h2 className="text-2xl font-bold text-slate-900">Create New Meetup</h2>
            <form onSubmit={handleCreate} className="mt-6 space-y-5">

              <div className="space-y-1.5">
                <label className="text-xs font-bold uppercase tracking-wider text-slate-500">Title</label>
                <input name="title" required className="w-full rounded-2xl border-slate-200 bg-slate-50 px-4 py-3 font-semibold focus:border-indigo-500 focus:ring-indigo-200" placeholder="e.g. Late Night Library Grind" />
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-bold uppercase tracking-wider text-slate-500">Location</label>
                <input name="location" className="w-full rounded-2xl border-slate-200 bg-slate-50 px-4 py-3 font-semibold focus:border-indigo-500 focus:ring-indigo-200" placeholder="e.g. Main Library, 3rd Floor" />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="text-xs font-bold uppercase tracking-wider text-slate-500">Category</label>
                  <select name="category" className="w-full rounded-2xl border-slate-200 bg-slate-50 px-4 py-3 font-semibold focus:border-indigo-500 focus:ring-indigo-200">
                    {CATEGORIES.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
                  </select>
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-bold uppercase tracking-wider text-slate-500">Start Time</label>
                  <input type="datetime-local" name="start_at" required className="w-full rounded-2xl border-slate-200 bg-slate-50 px-4 py-3 font-semibold focus:border-indigo-500 focus:ring-indigo-200" />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="text-xs font-bold uppercase tracking-wider text-slate-500">Duration (min)</label>
                  <input type="number" name="duration_min" defaultValue={60} min={15} className="w-full rounded-2xl border-slate-200 bg-slate-50 px-4 py-3 font-semibold focus:border-indigo-500 focus:ring-indigo-200" />
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-bold uppercase tracking-wider text-slate-500">Capacity</label>
                  <input type="number" name="capacity" defaultValue={10} max={50} className="w-full rounded-2xl border-slate-200 bg-slate-50 px-4 py-3 font-semibold focus:border-indigo-500 focus:ring-indigo-200" />
                </div>
              </div>

              <input type="hidden" name="visibility" value="GLOBAL" />

              <div className="flex gap-3 pt-4">
                <button type="button" onClick={() => setIsCreateOpen(false)} className="flex-1 rounded-xl bg-slate-100 py-3 font-bold text-slate-600 hover:bg-slate-200">Cancel</button>
                <button type="submit" disabled={createMutation.isPending} className="flex-1 rounded-xl bg-[#4f46e5] py-3 font-bold text-white hover:bg-indigo-700 shadow-sm">
                  {createMutation.isPending ? "Creating..." : "Create"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </main>
  );
}
