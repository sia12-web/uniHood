"use client";

import { useState, useEffect, Suspense, useRef } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import { ArrowLeft, BookOpen, Users, PenTool, Sparkles, Check, Heart, Loader2 } from "lucide-react";

import { createStoryBuilderSession } from "@/app/features/activities/api/client";
import { fetchFriends } from "@/lib/social";
import { readAuthUser } from "@/lib/auth-storage";
import { getDemoUserId, getDemoCampusId } from "@/lib/env";
import type { FriendRow } from "@/lib/types";
import { StoryBuilderPanel } from "@/app/features/activities/components/StoryBuilderPanel";
import { useStoryInvite } from "@/hooks/activities/use-story-invite";

function StoryActivityContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const searchString = searchParams?.toString() ?? "";
  // Support both 'id' (legacy) and 'session' (from chat invite links) params
  const activityId = searchParams?.get("id") || searchParams?.get("session");
  const inviteCardRef = useRef<HTMLDivElement>(null);
  const [inviteFocusPulse, setInviteFocusPulse] = useState(false);
  const wantsInviteFocus = searchParams?.get("focus") === "invites";

  // Local state for the "New Game" flow
  const [friends, setFriends] = useState<FriendRow[]>([]);
  const [loadingFriends, setLoadingFriends] = useState(false);
  const [friendsError, setFriendsError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [friendId, setFriendId] = useState<string>("");
  const { invite, acknowledge, dismiss } = useStoryInvite();

  // Acknowledge the invite when session is loaded from URL (suppresses notification)
  useEffect(() => {
    if (activityId) {
      acknowledge(activityId);
    }
  }, [activityId, acknowledge]);

  // Load friends if no activity ID
  useEffect(() => {
    if (!activityId) {
      setLoadingFriends(true);
      const user = readAuthUser();
      const userId = user?.userId || getDemoUserId();
      const campusId = user?.campusId || getDemoCampusId();

      fetchFriends(userId, campusId, "accepted")
        .then((data) => {
          setFriends(data);
          if (data.length > 0) {
            setFriendId(data[0].friend_id);
          }
        })
        .catch((err) => {
          console.error("Failed to load friends", err);
          setFriendsError(err instanceof Error ? err.message : "Failed to load friends");
        })
        .finally(() => setLoadingFriends(false));
    }
  }, [activityId]);

  const handleStartGame = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!friendId) return;
    setCreating(true);
    setCreateError(null);
    try {
      const { sessionId } = await createStoryBuilderSession(friendId);
      router.push(`/activities/story?id=${sessionId}`);
    } catch (err) {
      console.error("Failed to create story", err);
      setCreateError(err instanceof Error ? err.message : "Failed to create story");
      setCreating(false);
    }
  };

  const handleAcceptInvite = () => {
    if (!invite) return;
    acknowledge(invite.id);
    router.push(`/activities/story?id=${invite.id}`);
  };

  const handleDismissInvite = () => {
    if (!invite) return;
    dismiss(invite.id);
  };

  useEffect(() => {
    if (!wantsInviteFocus) {
      return;
    }
    inviteCardRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    setInviteFocusPulse(true);
    const timer = window.setTimeout(() => setInviteFocusPulse(false), 2200);
    const params = new URLSearchParams(searchString);
    params.delete("focus");
    const nextQuery = params.toString();
    router.replace(nextQuery ? `/activities/story?${nextQuery}` : "/activities/story", { scroll: false });
    return () => {
      window.clearTimeout(timer);
    };
  }, [router, searchString, wantsInviteFocus]);

  return (
    <div className="min-h-screen bg-slate-50 pb-20">
      {/* Hero Section with Full Image */}
      <div className="relative overflow-hidden shadow-xl">
        {/* Full Background Image */}
        <div className="relative aspect-[21/9] w-full">
          <Image
            src="/activities/story.svg"
            alt="Story Builder"
            fill
            className="object-cover"
            priority
          />
          {/* Gradient overlay for better text readability */}
          <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-black/20" />
        </div>

        {/* Back Button */}
        <div className="absolute left-6 top-6 z-10">
          <Link
            href="/"
            className="inline-flex items-center gap-2 rounded-full bg-black/30 px-4 py-2 text-sm font-medium text-white backdrop-blur-sm transition-colors hover:bg-black/50"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to Dashboard
          </Link>
        </div>

        {/* How to Play Card - Bottom Right */}
        <div className="absolute bottom-6 right-6 z-10 max-w-md">
          <div className="rounded-2xl bg-black/40 p-6 ring-1 ring-white/10 backdrop-blur-md">
            <h3 className="mb-4 flex items-center gap-2 text-lg font-semibold text-white">
              <Sparkles className="h-6 w-6 text-violet-400" />
              How to Play
            </h3>
            <ul className="space-y-3">
              <li className="flex items-start gap-3">
                <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-violet-500 text-sm font-bold text-white">1</div>
                <p className="text-sm text-slate-200">Start a story with a friend.</p>
              </li>
              <li className="flex items-start gap-3">
                <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-violet-500 text-sm font-bold text-white">2</div>
                <p className="text-sm text-slate-200">Both players click Ready.</p>
              </li>
              <li className="flex items-start gap-3">
                <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-violet-500 text-sm font-bold text-white">3</div>
                <p className="text-sm text-slate-200">Choose your roles (Boy/Girl).</p>
              </li>
              <li className="flex items-start gap-3">
                <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-violet-500 text-sm font-bold text-white">4</div>
                <p className="text-sm text-slate-200">Read the scenario and take turns writing.</p>
              </li>
            </ul>
          </div>
        </div>
      </div>

      <div className="mx-auto mt-8 max-w-5xl px-6">
        {activityId ? (
          <div className="space-y-6">
            <div className="overflow-hidden rounded-2xl bg-white shadow-xl ring-1 ring-slate-200">
              <div className="p-6">
                <StoryBuilderPanel sessionId={activityId} />
              </div>
            </div>
          </div>
        ) : (
          <div className="grid gap-8 lg:grid-cols-[1.5fr_1fr]">
            {/* Create Session Card */}
            <div className="rounded-3xl border border-slate-200 bg-white p-8 shadow-lg ring-1 ring-slate-900/5">
              <div className="mb-6 flex items-center justify-between">
                <div>
                  <h2 className="text-xl font-bold text-slate-900">Start a New Story</h2>
                  <p className="text-sm text-slate-500">Select a friend to write with.</p>
                </div>
                <div className="rounded-full bg-violet-50 p-3 text-violet-600">
                  <PenTool className="h-6 w-6" />
                </div>
              </div>

              <form onSubmit={handleStartGame} className="space-y-6">
                <div className="space-y-3">
                  <span className="text-sm font-medium text-slate-700">Select Partner</span>
                  <div className="max-h-64 overflow-y-auto rounded-2xl border border-slate-200 bg-slate-50 p-2">
                    {loadingFriends ? (
                      <div className="flex items-center justify-center py-8 text-slate-500">
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        Loading friends...
                      </div>
                    ) : friendsError ? (
                      <div className="p-4 text-center text-sm text-rose-600">{friendsError}</div>
                    ) : friends.length === 0 ? (
                      <div className="flex flex-col items-center justify-center py-8 text-center">
                        <Users className="mb-2 h-8 w-8 text-slate-300" />
                        <p className="text-sm text-slate-500">No friends available yet.</p>
                        <Link href="/friends" className="mt-2 text-xs font-medium text-violet-600 hover:underline">
                          Add friends first
                        </Link>
                      </div>
                    ) : (
                      <div className="space-y-1">
                        {friends.map((friend) => {
                          const label = friend.friend_display_name || friend.friend_handle || friend.friend_id;
                          const isSelected = friendId === friend.friend_id;
                          return (
                            <label
                              key={friend.friend_id}
                              className={`flex cursor-pointer items-center gap-3 rounded-xl p-3 transition-all ${isSelected
                                ? "bg-white shadow-md ring-1 ring-violet-500"
                                : "hover:bg-white hover:shadow-sm"
                                }`}
                            >
                              <input
                                type="radio"
                                name="friend"
                                value={friend.friend_id}
                                checked={isSelected}
                                onChange={() => setFriendId(friend.friend_id)}
                                className="sr-only"
                              />
                              <div className={`flex h-5 w-5 items-center justify-center rounded-full border ${isSelected ? "border-violet-600 bg-violet-600" : "border-slate-300"}`}>
                                {isSelected && <div className="h-2 w-2 rounded-full bg-white" />}
                              </div>
                              <div>
                                <div className={`font-medium ${isSelected ? "text-violet-900" : "text-slate-700"}`}>{label}</div>
                                {friend.friend_handle && (
                                  <div className="text-xs text-slate-500">@{friend.friend_handle}</div>
                                )}
                              </div>
                            </label>
                          );
                        })}
                      </div>
                    )}
                  </div>
                </div>

                {createError && (
                  <div className="rounded-xl bg-rose-50 p-3 text-sm text-rose-600">
                    {createError}
                  </div>
                )}

                <button
                  type="submit"
                  disabled={creating || !friendId}
                  className="group relative flex w-full items-center justify-center overflow-hidden rounded-xl bg-violet-600 px-8 py-4 font-bold text-white shadow-lg shadow-violet-500/30 transition-all hover:bg-violet-500 hover:shadow-violet-500/40 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <span className="relative z-10 flex items-center gap-2">
                    {creating ? (
                      <>
                        <Loader2 className="h-5 w-5 animate-spin" />
                        Creating Story...
                      </>
                    ) : (
                      <>
                        Create Story
                        <PenTool className="h-5 w-5 transition-transform group-hover:translate-x-1" />
                      </>
                    )}
                  </span>
                </button>
              </form>
            </div>
                        <PenTool className="h-4 w-4" />
                      </>
                    )}
                  </button>
                </form>
              </div>
            </div>

            {/* Invites Card */}
            <div className="flex flex-col gap-6">
              <div
                ref={inviteCardRef}
                className={`rounded-3xl bg-white p-8 shadow-lg ring-1 ring-slate-900/5 ${inviteFocusPulse || invite ? "border-2 border-violet-200 ring-violet-200/40" : "border border-slate-200"
                  }`}
              >
                <div className="mb-6 flex items-center justify-between">
                  <div>
                    <h2 className="text-xl font-bold text-slate-900">Invite Inbox</h2>
                    <p className="text-sm text-slate-500">Story invites waiting for you.</p>
                  </div>
                  <div className="rounded-full bg-violet-50 p-3 text-violet-600">
                    <BookOpen className="h-6 w-6" />
                  </div>
                </div>

                {invite ? (
                  <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-violet-500 to-purple-600 p-6 text-white shadow-lg">
                    <div className="relative z-10">
                      <h3 className="text-lg font-bold">New Story Invite!</h3>
                      <p className="mt-1 text-violet-100">
                        {friends.find(f => f.friend_id === invite.from)?.friend_display_name || friends.find(f => f.friend_id === invite.from)?.friend_handle || "A friend"} has invited you to write.
                      </p>

                      <div className="mt-6 flex items-center justify-end gap-2">
                        <button
                          onClick={handleDismissInvite}
                          className="rounded-xl bg-white/20 px-4 py-2 text-sm font-bold text-white shadow-sm transition hover:bg-white/30"
                        >
                          Dismiss
                        </button>
                        <button
                          onClick={handleAcceptInvite}
                          className="rounded-xl bg-white px-4 py-2 text-sm font-bold text-violet-600 shadow-sm transition hover:bg-violet-50"
                        >
                          Accept & Join
                        </button>
                      </div>
                    </div>

                    {/* Decorative circles */}
                    <div className="absolute -right-4 -top-4 h-24 w-24 rounded-full bg-white/10 blur-2xl" />
                    <div className="absolute -bottom-4 -left-4 h-32 w-32 rounded-full bg-white/10 blur-2xl" />
                  </div>
                ) : (
                  <div className="flex flex-col items-center justify-center rounded-2xl border-2 border-dashed border-slate-200 bg-slate-50 py-12 text-center">
                    <div className="rounded-full bg-slate-100 p-3">
                      <BookOpen className="h-6 w-6 text-slate-400" />
                    </div>
                    <p className="mt-3 text-sm font-medium text-slate-900">No pending invites</p>
                    <p className="mt-1 text-xs text-slate-500">Invites will appear here instantly.</p>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default function StoryActivityPage() {
  return (
    <Suspense fallback={<div className="flex min-h-screen items-center justify-center">Loading...</div>}>
      <StoryActivityContent />
    </Suspense>
  );
}
