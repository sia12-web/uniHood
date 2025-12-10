"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Plus, Calendar, Clock, Users, Lock, ArrowLeft } from "lucide-react";
import { listMeetups, createMeetup, MeetupCategory, MeetupResponse, MeetupVisibility } from "@/lib/meetups";
import { readAuthUser } from "@/lib/auth-storage";
import { useRouter } from "next/navigation";

const CATEGORIES: { label: string; value: MeetupCategory; color: string }[] = [
  { label: "Study", value: "study", color: "bg-blue-100 text-blue-700" },
  { label: "Social", value: "social", color: "bg-rose-100 text-rose-700" },
  { label: "Gym", value: "gym", color: "bg-orange-100 text-orange-700" },
  { label: "Food", value: "food", color: "bg-amber-100 text-amber-700" },
  { label: "Other", value: "other", color: "bg-slate-100 text-slate-700" },
];


function MeetupCard({ meetup, isOwner }: { meetup: MeetupResponse; isOwner: boolean }) {
  const category = CATEGORIES.find((c) => c.value === meetup.category) || CATEGORIES[4];
  const startDate = new Date(meetup.start_at);
  const isToday = startDate.toDateString() === new Date().toDateString();

  return (
    <Link
      href={`/meetups/${meetup.id}`}
      className={`group relative flex flex-col overflow-hidden rounded-3xl border p-5 shadow-sm transition hover:shadow-md ${isOwner
          ? "border-indigo-200 bg-gradient-to-br from-indigo-50/50 to-white ring-1 ring-indigo-100 hover:border-indigo-300"
          : "border-slate-200 bg-white"
        }`}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2">
          {isOwner && (
            <span className="rounded-full bg-indigo-600 px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-white">
              HOST
            </span>
          )}
          <span className={`rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-wide ${category.color}`}>
            {category.label}
          </span>
        </div>
        <div className="flex items-center gap-2">
          {meetup.status === "ACTIVE" && (
            <span className="flex items-center gap-1.5 rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-emerald-700">
              <span className="h-2 w-2 animate-pulse rounded-full bg-emerald-500" />
              Active
            </span>
          )}
          {meetup.visibility === "PRIVATE" && (
            <span className="flex items-center gap-1 rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-slate-600">
              <Lock className="h-3 w-3" />
              Private
            </span>
          )}
        </div>
      </div>

      <h3 className="mt-3 text-lg font-bold text-slate-900 group-hover:text-rose-600">{meetup.title}</h3>
      <p className="mt-1 line-clamp-2 text-sm text-slate-600">{meetup.description || "No description provided."}</p>

      <div className="mt-4 flex flex-wrap gap-3 text-xs font-medium text-slate-500">
        <div className="flex items-center gap-1.5">
          <Calendar className="h-3.5 w-3.5" />
          <span>{isToday ? "Today" : startDate.toLocaleDateString()}</span>
        </div>
        <div className="flex items-center gap-1.5">
          <Clock className="h-3.5 w-3.5" />
          <span>{startDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} ({meetup.duration_min}m)</span>
        </div>
        <div className="flex items-center gap-1.5">
          <Users className="h-3.5 w-3.5" />
          <span>{meetup.participants_count} joined</span>
        </div>
      </div>

      {meetup.is_joined && (
        <div className="absolute bottom-0 left-0 right-0 h-1 bg-rose-500" />
      )}
    </Link>
  );
}

export default function MeetupsPage() {
  const authUser = readAuthUser();
  const router = useRouter();
  const queryClient = useQueryClient();
  const [selectedCategory, setSelectedCategory] = useState<MeetupCategory | undefined>();
  const [isCreateOpen, setIsCreateOpen] = useState(false);

  const { data: meetups, isLoading } = useQuery({
    queryKey: ["meetups", authUser?.campusId, selectedCategory],
    queryFn: () => listMeetups(authUser?.campusId ?? undefined, selectedCategory),
    enabled: !!authUser?.campusId,
  });

  const createMutation = useMutation({
    mutationFn: createMeetup,
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["meetups"] });
      setIsCreateOpen(false);
      router.push(`/meetups/${data.id}`);
    },
    onError: (error) => {
      console.error("Failed to create meetup:", error);
      alert("Failed to create meetup. Please try again.");
    }
  });

  const handleCreate = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);

    const dateStr = formData.get("date") as string;
    const timeStr = formData.get("time") as string;

    if (!dateStr || !timeStr) {
      alert("Please select both date and time");
      return;
    }

    const startAt = new Date(`${dateStr}T${timeStr}`).toISOString();

    createMutation.mutate({
      title: formData.get("title") as string,
      description: formData.get("description") as string,
      category: formData.get("category") as MeetupCategory,
      start_at: startAt,
      duration_min: Number(formData.get("duration_min")),
      campus_id: authUser?.campusId ?? undefined,
      visibility: formData.get("visibility") as MeetupVisibility,
      capacity: Number(formData.get("capacity")),
    });
  };

  const next7Days = Array.from({ length: 7 }, (_, i) => {
    const date = new Date();
    date.setDate(date.getDate() + i);
    const value = date.toISOString().split('T')[0];
    let label = date.toLocaleDateString('en-US', { weekday: 'long' });
    if (i === 0) label = "Today";
    if (i === 1) label = "Tomorrow";
    return { label, value };
  });

  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) return null;

  if (!authUser) {
    return (
      <div className="flex min-h-screen items-center justify-center p-4">
        <div className="text-center">
          <h2 className="text-xl font-semibold">Please sign in to view meetups</h2>
          <Link href="/login" className="mt-4 inline-block rounded-xl bg-slate-900 px-6 py-2 text-white">
            Sign In
          </Link>
        </div>
      </div>
    );
  }

  return (
    <main className="min-h-screen bg-slate-50 px-4 py-8 md:px-8">
      <div className="mx-auto max-w-5xl">
        <header className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div>
            {/* Back Button */}
            <button
              onClick={() => router.back()}
              className="mb-3 flex items-center gap-2 text-sm font-medium text-slate-600 hover:text-slate-900 transition-colors"
            >
              <ArrowLeft className="h-4 w-4" />
              Back
            </button>
            <h1 className="text-3xl font-bold text-slate-900">Meetups</h1>
            <p className="mt-1 text-slate-600">Find study groups, games, and hangouts on campus.</p>
          </div>
          <button
            onClick={() => setIsCreateOpen(true)}
            className="inline-flex items-center justify-center gap-2 rounded-2xl bg-rose-600 px-5 py-3 text-sm font-bold text-white shadow-lg shadow-rose-200 transition hover:bg-rose-700 hover:shadow-rose-300"
          >
            <Plus className="h-5 w-5" />
            Create Meetup
          </button>
        </header>

        <div className="mt-8 flex flex-wrap gap-2">
          <button
            onClick={() => setSelectedCategory(undefined)}
            className={`rounded-xl px-4 py-2 text-sm font-semibold transition ${!selectedCategory ? "bg-slate-900 text-white" : "bg-white text-slate-600 hover:bg-slate-100"
              }`}
          >
            All
          </button>
          {CATEGORIES.map((cat) => (
            <button
              key={cat.value}
              onClick={() => setSelectedCategory(cat.value)}
              className={`rounded-xl px-4 py-2 text-sm font-semibold transition ${selectedCategory === cat.value ? "bg-slate-900 text-white" : "bg-white text-slate-600 hover:bg-slate-100"
                }`}
            >
              {cat.label}
            </button>
          ))}
        </div>

        <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {isLoading ? (
            Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="h-48 animate-pulse rounded-3xl bg-white shadow-sm" />
            ))
          ) : meetups?.length === 0 ? (
            <div className="col-span-full rounded-3xl border border-dashed border-slate-300 bg-slate-50 p-12 text-center">
              <p className="text-slate-500">No meetups found. Be the first to create one!</p>
            </div>
          ) : (
            meetups?.map((meetup) => <MeetupCard key={meetup.id} meetup={meetup} isOwner={meetup.creator_user_id === authUser?.userId} />)
          )}
        </div>
      </div>

      {isCreateOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4 backdrop-blur-sm">
          <div className="w-full max-w-lg rounded-3xl bg-white p-6 shadow-2xl">
            <h2 className="text-xl font-bold text-slate-900">Create New Meetup</h2>
            <form onSubmit={handleCreate} className="mt-6 space-y-4">
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-500">Title</label>
                <input
                  name="title"
                  required
                  minLength={3}
                  maxLength={100}
                  className="mt-1 w-full rounded-xl border border-slate-200 px-4 py-2 focus:border-rose-500 focus:outline-none focus:ring-2 focus:ring-rose-200"
                  placeholder="e.g., CS101 Study Group"
                />
              </div>

              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-500">Description</label>
                <textarea
                  name="description"
                  maxLength={500}
                  rows={3}
                  className="mt-1 w-full rounded-xl border border-slate-200 px-4 py-2 focus:border-rose-500 focus:outline-none focus:ring-2 focus:ring-rose-200"
                  placeholder="What's the plan?"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-slate-500">Category</label>
                  <select
                    name="category"
                    required
                    aria-label="Category"
                    className="mt-1 w-full rounded-xl border border-slate-200 px-4 py-2 focus:border-rose-500 focus:outline-none focus:ring-2 focus:ring-rose-200"
                  >
                    {CATEGORIES.map((c) => (
                      <option key={c.value} value={c.value}>{c.label}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-slate-500">Duration (min)</label>
                  <input
                    name="duration_min"
                    type="number"
                    required
                    min={15}
                    max={480}
                    defaultValue={60}
                    aria-label="Duration in minutes"
                    className="mt-1 w-full rounded-xl border border-slate-200 px-4 py-2 focus:border-rose-500 focus:outline-none focus:ring-2 focus:ring-rose-200"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-500">Capacity (Max Participants)</label>
                <input
                  name="capacity"
                  type="number"
                  required
                  min={2}
                  max={50}
                  defaultValue={10}
                  aria-label="Maximum participants"
                  className="mt-1 w-full rounded-xl border border-slate-200 px-4 py-2 focus:border-rose-500 focus:outline-none focus:ring-2 focus:ring-rose-200"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-slate-500">Date</label>
                  <select
                    name="date"
                    required
                    aria-label="Date"
                    className="mt-1 w-full rounded-xl border border-slate-200 px-4 py-2 focus:border-rose-500 focus:outline-none focus:ring-2 focus:ring-rose-200"
                  >
                    {next7Days.map((day) => (
                      <option key={day.value} value={day.value}>{day.label}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-slate-500">Time</label>
                  <input
                    name="time"
                    type="time"
                    required
                    aria-label="Time"
                    className="mt-1 w-full rounded-xl border border-slate-200 px-4 py-2 focus:border-rose-500 focus:outline-none focus:ring-2 focus:ring-rose-200"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-500">Visibility</label>
                <div className="mt-2 flex gap-4">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input type="radio" name="visibility" value="GLOBAL" defaultChecked className="text-rose-600 focus:ring-rose-500" />
                    <span className="text-sm font-medium text-slate-700">Global (Public)</span>
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input type="radio" name="visibility" value="PRIVATE" className="text-rose-600 focus:ring-rose-500" />
                    <span className="text-sm font-medium text-slate-700">Private (Friends Only)</span>
                  </label>
                </div>
              </div>

              <div className="mt-6 flex justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setIsCreateOpen(false)}
                  className="rounded-xl px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-100"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={createMutation.isPending}
                  className="rounded-xl bg-rose-600 px-6 py-2 text-sm font-bold text-white shadow hover:bg-rose-700 disabled:opacity-50"
                >
                  {createMutation.isPending ? "Creating..." : "Create Meetup"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </main>
  );
}
