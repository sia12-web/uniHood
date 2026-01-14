/* eslint-disable @next/next/no-img-element */
"use client";

import { useState, useEffect } from "react";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Plus, Users, Lock } from "lucide-react";
import { listMeetups, createMeetup, joinMeetup, MeetupCategory, MeetupVisibility, fetchMeetupUsage, MeetupResponse, updateMeetup, getMeetup, createReview } from "@/lib/meetups";
import { readAuthUser } from "@/lib/auth-storage";
import { fetchProfile } from "@/lib/identity";
import { LEVEL_CONFIG } from "@/lib/xp";
import { cn } from "@/lib/utils";
import { useMeetupNotifications } from "@/hooks/use-meetup-notifications";

import { MeetupCard, MEETUP_CATEGORIES } from "@/components/MeetupCard";

// Alias to avoid renaming everything below
const CATEGORIES = MEETUP_CATEGORIES;

const DEFAULT_BANNERS = [
  "https://images.unsplash.com/photo-1541339907198-e08756dedf3f?q=80&w=1470&auto=format&fit=crop", // Campus/Grad (Fresh)
  "https://images.unsplash.com/photo-1521587760476-6c12a4b040da?q=80&w=1470&auto=format&fit=crop", // Study/Library (Fresh)
  "https://images.unsplash.com/photo-1534438327276-14e5300c3a48?q=80&w=1470&auto=format&fit=crop", // Gym/Weights
  "https://images.unsplash.com/photo-1571902943202-507ec2618e8f?q=80&w=1470&auto=format&fit=crop", // Gym/Active
  "https://images.unsplash.com/photo-1501504905252-473c47e087f8?q=80&w=1374&auto=format&fit=crop", // Social/Party
  "https://images.unsplash.com/photo-1511632765486-a01980e01a18?q=80&w=1470&auto=format&fit=crop", // Coffee/Chat
  "https://images.unsplash.com/photo-1517048676732-d65bc937f952?q=80&w=1470&auto=format&fit=crop", // Group/Workshop
  "https://images.unsplash.com/photo-1523240795612-9a054b0db644?q=80&w=1470&auto=format&fit=crop", // Friends/Outdoor
];


export default function MeetupsPage() {
  const authUser = readAuthUser();
  const queryClient = useQueryClient();
  const { markAsSeen } = useMeetupNotifications();
  const [selectedCategory, setSelectedCategory] = useState<MeetupCategory | undefined>();
  const [showOnlyMine, setShowOnlyMine] = useState(false);
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [reviewingMeetup, setReviewingMeetup] = useState<MeetupResponse | null>(null);
  const [mounted, setMounted] = useState(false);
  const [userLevel, setUserLevel] = useState<number>(1);

  useEffect(() => {
    setMounted(true);

    // Clear meetup notifications when page loads
    markAsSeen();

    if (authUser?.userId && authUser?.campusId) {
      fetchProfile(authUser.userId, authUser.campusId)
        .then(profile => setUserLevel(profile.level))
        .catch(err => console.error("Failed to fetch level", err));
    }
  }, [authUser, markAsSeen]);

  const { data: meetups, isLoading } = useQuery({
    queryKey: ["meetups", authUser?.campusId, selectedCategory, showOnlyMine],
    queryFn: () => listMeetups(authUser?.campusId ?? undefined, selectedCategory, showOnlyMine ? authUser?.userId : undefined),
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
    onError: (err: unknown) => alert((err as { response?: { data?: { detail?: string } } })?.response?.data?.detail || "Failed to join meetup. Please try again.")
  });

  const [editingMeetup, setEditingMeetup] = useState<MeetupResponse | null>(null);

  const editMutation = useMutation({
    mutationFn: (data: { id: string; payload: Record<string, unknown> }) => updateMeetup(data.id, data.payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["meetups"] });
      queryClient.invalidateQueries({ queryKey: ["meetup-usage"] });
      setEditingMeetup(null);
    },
    onError: (err: { response?: { data?: { detail?: string } } }) => alert(err?.response?.data?.detail || "Failed to update meetup.")
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
        banner_url: formData.get("banner_url") as string || undefined,
      }
    });
  };

  const createMutation = useMutation({
    mutationFn: createMeetup,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["meetups"] });
      queryClient.invalidateQueries({ queryKey: ["meetup-usage"] });
      setIsCreateOpen(false);
    },
    onError: (err: unknown) => alert((err as { response?: { data?: { detail?: string } } })?.response?.data?.detail || "Failed to create meetup.")
  });

  // Review Logic
  const { data: reviewDetails } = useQuery({
    queryKey: ["meetup-detail", reviewingMeetup?.id],
    queryFn: () => getMeetup(reviewingMeetup!.id),
    enabled: !!reviewingMeetup,
  });

  const reviewMutation = useMutation({
    mutationFn: (data: { id: string; rating: number; content: string; targetId?: string }) =>
      createReview(data.id, data.rating, data.content, data.targetId),
    onSuccess: () => {
      alert("Review submitted!");
    },
    onError: (err: unknown) => alert((err as { response?: { data?: { detail?: string } } }).response?.data?.detail || "Failed to submit review")
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
      banner_url: formData.get("banner_url") as string || DEFAULT_BANNERS[0],
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
            onClick={() => {
              if (usage && usage.hosting_usage >= usage.hosting_limit) {
                alert(`You have reached your simultaneous hosting limit (${usage.hosting_limit}) for Level ${userLevel}.`);
                return;
              }
              setIsCreateOpen(true);
            }}
            className={cn(
              "group flex items-center gap-2 rounded-2xl px-6 py-3.5 text-sm font-bold shadow-sm transition-all",
              usage && usage.hosting_usage >= usage.hosting_limit
                ? "bg-slate-200 text-slate-400 cursor-not-allowed"
                : "bg-[#4f46e5] text-white hover:scale-105 hover:bg-indigo-700"
            )}
            title={usage && usage.hosting_usage >= usage.hosting_limit ? "Hosting limit reached" : "Create a new group event"}
          >
            {usage && usage.hosting_usage >= usage.hosting_limit ? <Lock className="h-4 w-4" /> : <Plus className="h-5 w-5" />}
            Create Meetup
          </button>
        </div>

        {/* Capacity Overview */}
        {usage && (
          <div className="flex flex-wrap gap-4 mt-2">
            <div className="flex items-center gap-2 px-4 py-2 bg-white dark:bg-slate-900 rounded-2xl border border-slate-100 dark:border-slate-800 shadow-sm">
              <div className="h-2 w-2 rounded-full bg-indigo-500 animate-pulse" />
              <span className="text-xs font-bold text-slate-500 uppercase tracking-tighter">Hosting:</span>
              <span className="text-sm font-black text-slate-900 dark:text-white">{usage.hosting_usage}/{usage.hosting_limit}</span>
            </div>
            <div className="flex items-center gap-2 px-4 py-2 bg-white dark:bg-slate-900 rounded-2xl border border-slate-100 dark:border-slate-800 shadow-sm">
              <div className="h-2 w-2 rounded-full bg-emerald-500" />
              <span className="text-xs font-bold text-slate-500 uppercase tracking-tighter">Joined:</span>
              <span className="text-sm font-black text-slate-900 dark:text-white">{usage.joining_usage}/{usage.joining_limit}</span>
            </div>

            <div className="flex items-center gap-2 px-4 py-2 bg-white dark:bg-slate-900 rounded-2xl border border-slate-100 dark:border-slate-800 shadow-sm">
              <span className="text-xs font-bold text-slate-500 uppercase tracking-tighter">Max Size:</span>
              <span className="text-sm font-black text-slate-900 dark:text-white">{usage.max_capacity}</span>
            </div>
          </div>
        )}

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
              <MeetupCard
                key={meetup.id}
                meetup={meetup}
                onJoin={(id) => joinMutation.mutate(id)}
                onEdit={(m) => setEditingMeetup(m)}
                onReview={(m) => setReviewingMeetup(m)}
              />
            ))
          )}
        </div>
      </div>

      {/* Edit Modal */}
      {editingMeetup && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="w-full max-w-lg rounded-[32px] bg-white shadow-2xl animate-in zoom-in-95 duration-200 max-h-[90vh] overflow-hidden flex flex-col">
            {/* Banner Preview */}
            <div className="relative h-48 w-full bg-slate-100 flex-shrink-0 group">
              <img
                src={(new FormData().get('banner_url') as string) || editingMeetup.banner_url || DEFAULT_BANNERS[0]}
                alt="Banner preview"
                className="h-full w-full object-cover"
                id="edit-banner-preview"
              />
              <div className="absolute inset-0 bg-black/20 group-hover:bg-black/40 transition-colors" />
              <div className="absolute bottom-4 left-4 right-4">
                <h2 className="text-2xl font-bold text-white drop-shadow-md">Edit Meetup</h2>
              </div>
            </div>

            <div className="p-8 overflow-y-auto">
              <form onSubmit={handleEditSubmit} className="space-y-6">
                {/* Banner Chooser */}
                <div className="space-y-2">
                  <label className="text-xs font-bold uppercase tracking-wider text-slate-500">Change Background</label>
                  <div className="flex gap-2 overflow-x-auto pb-2 scrollbar-hide">
                    {DEFAULT_BANNERS.map((url, i) => (
                      <label key={i} className="relative flex-shrink-0 cursor-pointer">
                        <input
                          type="radio"
                          name="banner_url"
                          value={url}
                          defaultChecked={editingMeetup.banner_url === url}
                          onChange={(e) => {
                            const img = document.getElementById('edit-banner-preview') as HTMLImageElement;
                            if (img) img.src = e.target.value;
                          }}
                          className="peer sr-only"
                        />
                        <img src={url} alt="Banner option" className="h-12 w-16 rounded-lg object-cover border-2 border-transparent peer-checked:border-indigo-600 transition-all" />
                      </label>
                    ))}
                    <div className="relative flex-shrink-0">
                      <input
                        type="text"
                        name="banner_url_custom"
                        placeholder="Custom URL..."
                        className="h-12 w-32 rounded-lg border-2 border-slate-200 bg-slate-50 px-2 text-[10px] focus:border-indigo-500 outline-none"
                        onChange={(e) => {
                          const img = document.getElementById('edit-banner-preview') as HTMLImageElement;
                          if (img && e.target.value) img.src = e.target.value;
                        }}
                      />
                    </div>
                  </div>
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-bold uppercase tracking-wider text-slate-500">Category</label>
                  <select name="category" defaultValue={editingMeetup.category} className="w-full rounded-2xl border-slate-200 bg-slate-50 px-4 py-3 font-semibold focus:border-indigo-500 focus:ring-indigo-200">
                    {CATEGORIES.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
                  </select>
                </div>

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
                    <label className="text-xs font-bold uppercase tracking-wider text-slate-500">Start Time</label>
                    <input type="datetime-local" name="start_at" required defaultValue={new Date(new Date(editingMeetup.start_at).getTime() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 16)} className="w-full rounded-2xl border-slate-200 bg-slate-50 px-4 py-3 font-semibold focus:border-indigo-500 focus:ring-indigo-200" />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-xs font-bold uppercase tracking-wider text-slate-500">Duration (min)</label>
                    <input type="number" name="duration_min" defaultValue={editingMeetup.duration_min} min={15} className="w-full rounded-2xl border-slate-200 bg-slate-50 px-4 py-3 font-semibold focus:border-indigo-500 focus:ring-indigo-200" />
                  </div>
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-bold uppercase tracking-wider text-slate-500">Capacity</label>
                  <input type="number" name="capacity" defaultValue={editingMeetup.capacity} min={editingMeetup.participants_count} className="w-full rounded-2xl border-slate-200 bg-slate-50 px-4 py-3 font-semibold focus:border-indigo-500 focus:ring-indigo-200" />
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
                  <button type="button" onClick={() => setEditingMeetup(null)} className="flex-1 rounded-xl bg-slate-100 py-3 font-bold text-slate-600 hover:bg-slate-200">Cancel</button>
                  <button type="submit" disabled={editMutation.isPending} className="flex-1 rounded-xl bg-[#4f46e5] py-3 font-bold text-white hover:bg-indigo-700 shadow-lg transition-all">
                    {editMutation.isPending ? "Saving..." : "Save Changes"}
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}

      {/* Simple Modal for MVP - reused styling */}
      {isCreateOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="w-full max-w-lg rounded-[32px] bg-white shadow-2xl animate-in zoom-in-95 duration-200 max-h-[90vh] overflow-hidden flex flex-col border-4 border-indigo-100">
            {/* Banner Preview */}
            <div className="relative h-48 w-full bg-slate-100 flex-shrink-0">
              <img
                src={DEFAULT_BANNERS[0]}
                alt="Banner preview"
                className="h-full w-full object-cover"
                id="banner-preview"
              />
              <div className="absolute inset-0 bg-black/20" />
              <div className="absolute bottom-4 left-4 right-4">
                <h2 className="text-2xl font-bold text-white drop-shadow-md">Create New Meetup</h2>
                <div className="mt-1 flex gap-2">
                  <span className="bg-white/90 backdrop-blur-sm text-[10px] font-bold px-2 py-0.5 rounded text-indigo-700 uppercase tracking-wider">
                    Lvl {userLevel} host
                  </span>
                </div>
              </div>
            </div>

            <div className="p-8 overflow-y-auto">
              <form onSubmit={handleCreate} className="space-y-6">
                {/* Banner Chooser */}
                <div className="space-y-2">
                  <label className="text-xs font-bold uppercase tracking-wider text-slate-500">Pick a Vibe</label>
                  <div className="flex gap-2 overflow-x-auto pb-2 scrollbar-hide">
                    {DEFAULT_BANNERS.map((url, i) => (
                      <label key={url} className="relative flex-shrink-0 cursor-pointer">
                        <input
                          type="radio"
                          name="banner_url"
                          value={url}
                          defaultChecked={i === 0}
                          onChange={(e) => {
                            const img = document.getElementById('banner-preview') as HTMLImageElement;
                            if (img) img.src = e.target.value;
                          }}
                          className="peer sr-only"
                        />
                        <img src={url} alt="Banner option" className="h-12 w-16 rounded-lg object-cover border-2 border-transparent peer-checked:border-indigo-600 transition-all opacity-80 peer-checked:opacity-100" />
                      </label>
                    ))}
                  </div>
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-bold uppercase tracking-wider text-slate-500">Category</label>
                  <select name="category" className="w-full rounded-2xl border-slate-200 bg-slate-50 px-4 py-3 font-semibold focus:border-indigo-500 focus:ring-indigo-200">
                    {CATEGORIES.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
                  </select>
                </div>

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
                    <label className="text-xs font-bold uppercase tracking-wider text-slate-500">Start Time</label>
                    <input type="datetime-local" name="start_at" required className="w-full rounded-2xl border-slate-200 bg-slate-50 px-4 py-3 font-semibold focus:border-indigo-500 focus:ring-indigo-200" />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-xs font-bold uppercase tracking-wider text-slate-500">Duration (min)</label>
                    <input type="number" name="duration_min" defaultValue={60} min={15} className="w-full rounded-2xl border-slate-200 bg-slate-50 px-4 py-3 font-semibold focus:border-indigo-500 focus:ring-indigo-200" />
                  </div>
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-bold uppercase tracking-wider text-slate-500">
                    Capacity (Max {usage?.max_capacity || LEVEL_CONFIG[userLevel].maxMeetupCapacity})
                  </label>
                  <input
                    type="number"
                    name="capacity"
                    defaultValue={Math.min(10, usage?.max_capacity || LEVEL_CONFIG[userLevel].maxMeetupCapacity)}
                    max={usage?.max_capacity || LEVEL_CONFIG[userLevel].maxMeetupCapacity}
                    className="w-full rounded-2xl border-slate-200 bg-slate-50 px-4 py-3 font-semibold focus:border-indigo-500 focus:ring-indigo-200"
                  />
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
                </div>

                <div className="flex gap-3 pt-4">
                  <button type="button" onClick={() => setIsCreateOpen(false)} className="flex-1 rounded-xl bg-slate-100 py-3 font-bold text-slate-600 hover:bg-slate-200">Cancel</button>
                  <button type="submit" disabled={createMutation.isPending} className="flex-1 rounded-xl bg-[#4f46e5] py-3 font-bold text-white hover:bg-indigo-700 shadow-xl transition-all">
                    {createMutation.isPending ? "Creating..." : "Build Meetup"}
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}

      {/* Review Modal */}
      {reviewingMeetup && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="w-full max-w-lg rounded-[32px] bg-white shadow-2xl animate-in zoom-in-95 duration-200 max-h-[90vh] overflow-hidden flex flex-col p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-2xl font-bold text-slate-900">Review Meetup</h2>
              <button onClick={() => setReviewingMeetup(null)} className="p-2 hover:bg-slate-100 rounded-full">✕</button>
            </div>

            <div className="overflow-y-auto space-y-6">
              {authUser?.userId !== reviewingMeetup.creator_user_id && (
                <div className="p-4 bg-slate-50 rounded-2xl border border-slate-100">
                  <h3 className="font-bold text-slate-900 mb-2">Rate the Event</h3>
                  <div className="flex gap-2 mb-3">
                    {[1, 2, 3, 4, 5].map(star => (
                      <button key={star} onClick={() => reviewMutation.mutate({ id: reviewingMeetup.id, rating: star, content: "" })} className="text-2xl hover:scale-110 transition-transform">⭐</button>
                    ))}
                  </div>
                  <p className="text-xs text-slate-500">Click a star to quick-rate the vibe.</p>
                </div>
              )}

              <div>
                <h3 className="font-bold text-slate-900 mb-4">Participants</h3>
                {reviewDetails ? (
                  <div className="space-y-3">
                    {reviewDetails.participants.filter(p => p.user_id !== authUser?.userId).map(p => (
                      <div key={p.user_id} className="flex items-center justify-between p-3 rounded-xl border border-slate-100 hover:border-indigo-200 transition-colors">
                        <div className="flex items-center gap-3">
                          <div className="h-10 w-10 rounded-full bg-slate-200 overflow-hidden relative">
                            {p.avatar_url && <img src={p.avatar_url} alt={p.display_name || ""} className="object-cover h-full w-full" />}
                          </div>
                          <div>
                            <p className="font-bold text-sm text-slate-900">{p.display_name || "User"}</p>
                            <p className="text-xs text-slate-500">{p.role}</p>
                          </div>
                        </div>
                        <button
                          onClick={() => {
                            const rating = prompt("Rate this person (1-5):");
                            if (rating) reviewMutation.mutate({ id: reviewingMeetup.id, rating: Number(rating), content: "Participant review", targetId: p.user_id });
                          }}
                          className="px-3 py-1.5 text-xs font-bold text-indigo-600 bg-indigo-50 rounded-lg hover:bg-indigo-100"
                        >
                          Rate
                        </button>
                      </div>
                    ))}
                    {reviewDetails.participants.length <= 1 && <p className="text-slate-500 italic text-sm">No other participants to review.</p>}
                  </div>
                ) : (
                  <div className="flex justify-center py-4"><span className="animate-spin">⏳</span></div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
