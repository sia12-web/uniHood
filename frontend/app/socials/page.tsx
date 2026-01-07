"use client";

import { useState, useEffect } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import DiscoveryFeed from "@/components/DiscoveryFeed";
import { MyFriends } from "@/components/social/MyFriends";
import { MyMeetups } from "@/components/social/MyMeetups";
import { RequestsAndBlocks } from "@/components/social/RequestsAndBlocks";
import { Sparkles, Users, Calendar, Inbox } from "lucide-react";
import { cn } from "@/lib/utils";
import { useMeetupNotifications } from "@/hooks/use-meetup-notifications";

import { Suspense } from "react";

function SocialsContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const initialTab = (searchParams.get("tab") as "discover" | "friends" | "requests" | "meetups") || "discover";
  const [activeTab, setActiveTab] = useState<"discover" | "friends" | "requests" | "meetups">(initialTab);
  const { markAsSeen } = useMeetupNotifications();

  const handleTabChange = (tab: typeof activeTab) => {
    setActiveTab(tab);
    router.replace(`/socials?tab=${tab}`, { scroll: false });

    // Clear meetup notifications when meetups tab is clicked
    if (tab === "meetups") {
      markAsSeen();
    }
  };

  useEffect(() => {
    const tab = searchParams.get("tab");
    if (tab && (tab === "discover" || tab === "friends" || tab === "requests" || tab === "meetups")) {
      setActiveTab(tab as typeof activeTab);
    }
  }, [searchParams]);

  return (
    <main className="min-h-screen bg-slate-50 dark:bg-slate-950 font-sans pb-20">
      <div className="mx-auto max-w-7xl px-4 py-8 md:px-8 space-y-8">

        {/* Header */}
        <header className="space-y-4">
          <h1 className="text-4xl font-extrabold text-slate-900 dark:text-white tracking-tight">Socials</h1>
          <p className="text-lg text-slate-600 dark:text-slate-400">Discover people, manage friends, and connect with your campus.</p>
        </header>

        {/* Tabs */}
        <div className="flex flex-wrap gap-2 p-1 bg-slate-200 dark:bg-slate-900 rounded-2xl w-fit">
          <button
            onClick={() => handleTabChange("discover")}
            className={cn(
              "px-6 py-2.5 rounded-xl font-bold text-sm flex items-center gap-2 transition-all",
              activeTab === "discover" ? "bg-white dark:bg-slate-800 text-indigo-600 dark:text-indigo-400 shadow-sm" : "text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200"
            )}
          >
            <Sparkles size={16} /> Discover
          </button>
          <button
            onClick={() => handleTabChange("friends")}
            className={cn(
              "px-6 py-2.5 rounded-xl font-bold text-sm flex items-center gap-2 transition-all",
              activeTab === "friends" ? "bg-white dark:bg-slate-800 text-indigo-600 dark:text-indigo-400 shadow-sm" : "text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200"
            )}
          >
            <Users size={16} /> Friends
          </button>
          <button
            onClick={() => handleTabChange("requests")}
            className={cn(
              "px-6 py-2.5 rounded-xl font-bold text-sm flex items-center gap-2 transition-all",
              activeTab === "requests" ? "bg-white dark:bg-slate-800 text-indigo-600 dark:text-indigo-400 shadow-sm" : "text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200"
            )}
          >
            <Inbox size={16} /> Requests
          </button>
          <button
            onClick={() => handleTabChange("meetups")}
            className={cn(
              "px-6 py-2.5 rounded-xl font-bold text-sm flex items-center gap-2 transition-all",
              activeTab === "meetups" ? "bg-white dark:bg-slate-800 text-indigo-600 dark:text-indigo-400 shadow-sm" : "text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200"
            )}
          >
            <Calendar size={16} /> My Meetups
          </button>
        </div>

        {/* Content */}
        <div className="min-h-[500px]">
          {activeTab === "discover" && (
            <div className="animate-in fade-in slide-in-from-bottom-4 duration-500">
              <DiscoveryFeed />
            </div>
          )}
          {activeTab === "friends" && (
            <div className="animate-in fade-in slide-in-from-bottom-4 duration-500">
              <MyFriends />
            </div>
          )}
          {activeTab === "requests" && (
            <div className="animate-in fade-in slide-in-from-bottom-4 duration-500">
              <RequestsAndBlocks />
            </div>
          )}
          {activeTab === "meetups" && (
            <div className="animate-in fade-in slide-in-from-bottom-4 duration-500">
              <MyMeetups />
            </div>
          )}
        </div>
      </div>
    </main>
  );
}

export default function SocialsPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-slate-50 dark:bg-slate-950 flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600"></div>
      </div>
    }>
      <SocialsContent />
    </Suspense>
  );
}


