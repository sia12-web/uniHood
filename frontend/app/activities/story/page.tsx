"use client";

import { useState, useEffect, Suspense, useRef } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, BookOpen, Users, PenTool, Sparkles, Copy, Check, Heart } from "lucide-react";

import { createActivity } from "@/lib/activities";
import { fetchFriends } from "@/lib/social";
import { readAuthUser } from "@/lib/auth-storage";
import { getDemoUserId, getDemoCampusId } from "@/lib/env";
import type { FriendRow } from "@/lib/types";
import { StoryPanel } from "@/app/features/activities/components/StoryPanel";
import { useStoryInvite } from "@/hooks/activities/use-story-invite";

function StoryActivityContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const searchString = searchParams?.toString() ?? "";
  const activityId = searchParams?.get("id");
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
  const [copied, setCopied] = useState(false);
  const { invite, acknowledge, dismiss } = useStoryInvite();

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
      const summary = await createActivity(friendId, {
        kind: "story_alt",
        options: {}
      });
      router.push(`/activities/story?id=${summary.id}`);
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

  const copySessionId = () => {
    if (!activityId) return;
    navigator.clipboard.writeText(activityId);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
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
      {/* Hero Section */}
      <div className="relative overflow-hidden bg-slate-900 pb-12 pt-16 text-white shadow-xl lg:pt-24">
        <div className="absolute inset-0 opacity-10">
          <svg className="h-full w-full" viewBox="0 0 100 100" preserveAspectRatio="none">
            <path d="M0 100 C 20 0 50 0 100 100 Z" fill="white" />
          </svg>
        </div>
        
        <div className="relative mx-auto max-w-5xl px-6">
          <Link 
            href="/" 
            className="mb-8 inline-flex items-center gap-2 rounded-full bg-white/10 px-4 py-2 text-sm font-medium text-white backdrop-blur-sm transition-colors hover:bg-white/20"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to Dashboard
          </Link>

          <div className="grid gap-12 lg:grid-cols-2 lg:items-center">
            <div className="space-y-6">
              <div className="inline-flex items-center gap-2 rounded-full bg-violet-500/20 px-3 py-1 text-sm font-medium text-violet-300 ring-1 ring-inset ring-violet-500/40">
                <PenTool className="h-4 w-4" />
                <span>Co-op Writing</span>
              </div>
              
              <h1 className="text-4xl font-bold tracking-tight text-white sm:text-6xl">
                Story <span className="text-violet-400">Builder</span>
              </h1>
              
              <p className="text-lg leading-8 text-slate-300">
                Create a unique romantic story together. Take turns writing parts of the narrative and see where your imagination leads.
              </p>
            </div>

            {/* How to Play Card */}
            <div className="relative rounded-2xl bg-white/5 p-8 ring-1 ring-white/10 backdrop-blur-sm">
              <h3 className="mb-6 flex items-center gap-2 text-lg font-semibold text-white">
                <Sparkles className="h-5 w-5 text-violet-400" />
                How to Play
              </h3>
              <ul className="space-y-4">
                <li className="flex items-start gap-3">
                  <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-violet-500 text-xs font-bold">1</div>
                  <p className="text-sm text-slate-300">Start a story with a friend.</p>
                </li>
                <li className="flex items-start gap-3">
                  <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-violet-500 text-xs font-bold">2</div>
                  <p className="text-sm text-slate-300">Both players click Ready.</p>
                </li>
                <li className="flex items-start gap-3">
                  <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-violet-500 text-xs font-bold">3</div>
                  <p className="text-sm text-slate-300">Choose your roles (Boy/Girl).</p>
                </li>
                <li className="flex items-start gap-3">
                  <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-violet-500 text-xs font-bold">4</div>
                  <p className="text-sm text-slate-300">Read the scenario and take turns writing.</p>
                </li>
              </ul>
            </div>
          </div>
        </div>
      </div>

      <div className="mx-auto mt-8 max-w-5xl px-6">
        {activityId ? (
          <div className="space-y-6">
            <div className="overflow-hidden rounded-2xl bg-white shadow-xl ring-1 ring-slate-200">
              <div className="border-b border-slate-100 bg-slate-50/50 px-6 py-4">
                <div className="flex flex-wrap items-center justify-between gap-4">
                  <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-full bg-violet-100 text-violet-600">
                      <BookOpen className="h-5 w-5" />
                    </div>
                    <div>
                      <h2 className="text-sm font-semibold text-slate-900">Active Story</h2>
                      <div className="flex items-center gap-2">
                        <code className="rounded bg-slate-100 px-1.5 py-0.5 text-xs font-mono text-slate-600">{activityId}</code>
                        <button 
                          onClick={copySessionId}
                          className="text-slate-400 hover:text-slate-600"
                          title="Copy Session ID"
                        >
                          {copied ? <Check className="h-3.5 w-3.5 text-emerald-500" /> : <Copy className="h-3.5 w-3.5" />}
                        </button>
                      </div>
                    </div>
                  </div>
                  <Link 
                    href="/activities/story"
                    className="text-xs font-medium text-slate-500 hover:text-slate-800"
                  >
                    Leave Story
                  </Link>
                </div>
              </div>
              
              <div className="p-6">
                <StoryPanel />
              </div>
            </div>
          </div>
        ) : (
          <div className="grid gap-6 md:grid-cols-2">
            {/* Create Session Card */}
            <div className="overflow-hidden rounded-2xl bg-white shadow-lg ring-1 ring-slate-200 transition-all hover:shadow-xl">
              <div className="bg-gradient-to-r from-violet-600 to-purple-600 px-6 py-8 text-white">
                <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-white/20 backdrop-blur-sm">
                  <PenTool className="h-6 w-6 text-white" />
                </div>
                <h2 className="text-2xl font-bold">Start a Story</h2>
                <p className="mt-2 text-violet-100">Begin a new collaborative tale.</p>
              </div>
              
              <div className="p-6">
                <form onSubmit={handleStartGame} className="space-y-6">
                  <div className="space-y-3">
                    <label className="text-sm font-medium text-slate-700">Choose Partner</label>
                    <div className="max-h-60 overflow-y-auto rounded-xl border border-slate-200 bg-slate-50">
                      {loadingFriends ? (
                        <div className="flex items-center justify-center p-8 text-sm text-slate-500">
                          <div className="mr-2 h-4 w-4 animate-spin rounded-full border-2 border-slate-300 border-t-violet-600"></div>
                          Loading friends...
                        </div>
                      ) : friendsError ? (
                        <div className="p-4 text-center text-sm text-rose-600">{friendsError}</div>
                      ) : friends.length === 0 ? (
                        <div className="p-8 text-center text-sm text-slate-500">
                          No friends found. Add some friends to play!
                        </div>
                      ) : (
                        <ul className="divide-y divide-slate-100">
                          {friends.map((friend) => {
                            const label = friend.friend_display_name || friend.friend_handle || friend.friend_id;
                            const isSelected = friendId === friend.friend_id;
                            return (
                              <li key={friend.friend_id}>
                                <label className={`flex cursor-pointer items-center justify-between px-4 py-3 transition-colors ${isSelected ? 'bg-violet-50' : 'hover:bg-slate-100'}`}>
                                  <div className="flex items-center gap-3">
                                    <div className={`flex h-8 w-8 items-center justify-center rounded-full ${isSelected ? 'bg-violet-100 text-violet-600' : 'bg-slate-200 text-slate-500'}`}>
                                      <Users className="h-4 w-4" />
                                    </div>
                                    <div>
                                      <p className={`text-sm font-medium ${isSelected ? 'text-violet-900' : 'text-slate-700'}`}>{label}</p>
                                      {friend.friend_handle && (
                                        <p className="text-xs text-slate-500">@{friend.friend_handle}</p>
                                      )}
                                    </div>
                                  </div>
                                  <div className={`flex h-5 w-5 items-center justify-center rounded-full border ${isSelected ? 'border-violet-500 bg-violet-500' : 'border-slate-300'}`}>
                                    {isSelected && <Check className="h-3 w-3 text-white" />}
                                  </div>
                                  <input
                                    type="radio"
                                    name="friend"
                                    value={friend.friend_id}
                                    checked={isSelected}
                                    onChange={() => setFriendId(friend.friend_id)}
                                    className="sr-only"
                                  />
                                </label>
                              </li>
                            );
                          })}
                        </ul>
                      )}
                    </div>
                  </div>

                  {createError && (
                    <div className="rounded-lg bg-rose-50 p-3 text-sm text-rose-600">
                      {createError}
                    </div>
                  )}

                  <button
                    type="submit"
                    disabled={creating || !friendId}
                    className="flex w-full items-center justify-center gap-2 rounded-xl bg-violet-600 px-4 py-3 text-sm font-semibold text-white shadow-sm transition-all hover:bg-violet-500 hover:shadow disabled:cursor-not-allowed disabled:bg-slate-200 disabled:text-slate-400"
                  >
                    {creating ? (
                      <>
                        <div className="h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white"></div>
                        Creating...
                      </>
                    ) : (
                      <>
                        Create Story
                        <PenTool className="h-4 w-4" />
                      </>
                    )}
                  </button>
                </form>
              </div>
            </div>

            {/* Invite Inbox Card */}
            <div
              ref={inviteCardRef}
              className={`overflow-hidden rounded-2xl bg-white shadow-lg transition-all hover:shadow-xl ${
                inviteFocusPulse || invite ? "ring-2 ring-violet-300" : "ring-1 ring-slate-200"
              }`}
            >
              <div className="bg-slate-800 px-6 py-8 text-white">
                <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-white/10 backdrop-blur-sm">
                  <Heart className="h-6 w-6 text-pink-400" />
                </div>
                <h2 className="text-2xl font-bold">Invites</h2>
                <p className="mt-2 text-slate-400">Join a story in progress.</p>
              </div>
              
              <div className="p-6">
                {invite ? (
                  <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-violet-500 to-purple-600 p-6 text-white shadow-lg">
                    <div className="relative z-10">
                      <h3 className="text-lg font-bold">New Story Invite!</h3>
                      <p className="mt-1 text-violet-100">A friend has invited you to write.</p>
                      
                      <div className="mt-6 flex items-center justify-between gap-4">
                        <div className="font-mono text-xs text-violet-200/80">
                          ID: {invite.id.slice(0, 8)}...
                        </div>
                        <div className="flex gap-2">
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
                    </div>
                    
                    {/* Decorative circles */}
                    <div className="absolute -right-4 -top-4 h-24 w-24 rounded-full bg-white/10 blur-2xl" />
                    <div className="absolute -bottom-4 -left-4 h-32 w-32 rounded-full bg-white/10 blur-2xl" />
                  </div>
                ) : (
                  <div className="flex flex-col items-center justify-center py-12 text-center">
                    <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-slate-100 text-slate-400">
                      <BookOpen className="h-6 w-6" />
                    </div>
                    <p className="text-sm font-medium text-slate-900">No pending invites</p>
                    <p className="text-xs text-slate-500">Invites will appear here.</p>
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
