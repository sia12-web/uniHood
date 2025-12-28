"use client";

import { useState, useEffect } from "react";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Plus, Users } from "lucide-react";
import { listMeetups, createMeetup, joinMeetup, MeetupCategory, MeetupVisibility, fetchMeetupUsage, type MeetupUsage } from "@/lib/meetups";
import { readAuthUser } from "@/lib/auth-storage";
import { fetchProfile } from "@/lib/identity";
import { LEVEL_CONFIG } from "@/lib/xp";
import { cn } from "@/lib/utils";

import { MeetupCard, MEETUP_CATEGORIES } from "@/components/MeetupCard";

// Alias to avoid renaming everything below
const CATEGORIES = MEETUP_CATEGORIES;


export default function MeetupsPage() {
  const authUser = readAuthUser();
  const queryClient = useQueryClient();
  const [selectedCategory, setSelectedCategory] = useState<MeetupCategory | undefined>();
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [userLevel, setUserLevel] = useState<number>(1);

  useEffect(() => {
    setMounted(true);
    if (authUser?.userId && authUser?.campusId) {
      fetchProfile(authUser.userId, authUser.campusId)
        .then(profile => setUserLevel(profile.level))
        .catch(err => console.error("Failed to fetch level", err));
    }
  }, [authUser]);

  const { data: meetups, isLoading } = useQuery({
    queryKey: ["meetups", authUser?.campusId, selectedCategory],
    queryFn: () => listMeetups(authUser?.campusId ?? undefined, selectedCategory),
    enabled: !!authUser?.campusId,
  });

  const { data: usage } = useQuery({
    queryKey: ["meetup-usage"],
    queryFn: () => fetchMeetupUsage(),
    enabled: !!authUser?.userId,
  });

  const joinMutation = useMutation({
    mutationFn: (id: string) => joinMeetup(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["meetups"] });
      queryClient.invalidateQueries({ queryKey: ["meetup-usage"] });
    },
    onError: (err: any) => alert(err?.response?.data?.detail || "Failed to join meetup. Please try again.")
  });

  const createMutation = useMutation({
    mutationFn: createMeetup,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["meetups"] });
      queryClient.invalidateQueries({ queryKey: ["meetup-usage"] });
      setIsCreateOpen(false);
    },
    onError: (err: any) => alert(err?.response?.data?.detail || "Failed to create meetup.")
  });

  const handleCreate = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);

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
            <div className="flex items-center justify-between mb-2">
              <h2 className="text-2xl font-bold text-slate-900">Create New Meetup</h2>
              <div className="bg-indigo-50 px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-wider text-indigo-600 border border-indigo-100">
                Lvl {userLevel} Restrictions
              </div>
            </div>

            {usage && (
              <div className="text-xs text-slate-400 mb-6 font-medium space-y-1">
                <p>
                  Active Hosting: <span className={cn("font-bold", usage.hosting_usage >= usage.hosting_limit ? "text-rose-500" : "text-indigo-600")}>
                    {usage.hosting_usage}/{usage.hosting_limit}
                  </span> • Active Joined: <span className={cn("font-bold", usage.joining_usage >= usage.joining_limit ? "text-rose-500" : "text-indigo-600")}>
                    {usage.joining_usage}/{usage.joining_limit}
                  </span>
                </p>
                <p>
                  Daily Created: <span className={cn("font-bold", usage.daily_create_usage >= usage.daily_create_limit ? "text-rose-500" : "text-indigo-600")}>
                    {usage.daily_create_usage}/{usage.daily_create_limit}
                  </span>
                </p>
              </div>
            )}

            <form onSubmit={handleCreate} className="mt-2 space-y-5">

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
                  <label className="text-xs font-bold uppercase tracking-wider text-slate-500">
                    Capacity (Max {LEVEL_CONFIG[userLevel].maxMeetupCapacity})
                  </label>
                  <input
                    type="number"
                    name="capacity"
                    defaultValue={Math.min(10, LEVEL_CONFIG[userLevel].maxMeetupCapacity)}
                    max={LEVEL_CONFIG[userLevel].maxMeetupCapacity}
                    className="w-full rounded-2xl border-slate-200 bg-slate-50 px-4 py-3 font-semibold focus:border-indigo-500 focus:ring-indigo-200"
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-bold uppercase tracking-wider text-slate-500">Visibility</label>
                <div className="grid grid-cols-3 gap-3">
                  <label className="cursor-pointer">
                    <input type="radio" name="visibility" value="FRIENDS" defaultChecked className="peer sr-only" />
                    <div className="rounded-xl border-2 border-slate-200 bg-slate-50 px-2 py-3 text-center text-[10px] font-bold text-slate-400 peer-checked:border-indigo-500 peer-checked:bg-indigo-50 peer-checked:text-indigo-600 transition-all">
                      Friends
                    </div>
                  </label>
                  <label className="cursor-pointer">
                    <input type="radio" name="visibility" value="CAMPUS" className="peer sr-only" />
                    <div className="rounded-xl border-2 border-slate-200 bg-slate-50 px-2 py-3 text-center text-[10px] font-bold text-slate-400 peer-checked:border-indigo-500 peer-checked:bg-indigo-50 peer-checked:text-indigo-600 transition-all">
                      Campus
                    </div>
                  </label>
                  <label className={cn("cursor-pointer", userLevel < 2 && "opacity-50 cursor-not-allowed")}>
                    <input
                      type="radio"
                      name="visibility"
                      value="CITY"
                      disabled={userLevel < 2}
                      className="peer sr-only"
                    />
                    <div className="rounded-xl border-2 border-slate-200 bg-slate-50 px-2 py-3 text-center text-[10px] font-bold text-slate-400 peer-checked:border-emerald-500 peer-checked:bg-emerald-50 peer-checked:text-emerald-600 transition-all">
                      City {userLevel < 2 && "🔒"}
                    </div>
                  </label>
                </div>
                <p className="text-[10px] text-slate-400 px-1">
                  {userLevel < 2 ? "Lvl 2+ required for City scope. " : ""}
                  Friends: Only visible to mutually connected friends. Campus: visible to your university. City: visible to all local students.
                </p>
              </div>

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
