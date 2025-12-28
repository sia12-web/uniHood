"use client";

import { SocialScoreGuideContent } from "@/components/social/SocialScoreGuide";
import { SocialRoadmap } from "@/components/social/SocialRoadmap";
import { ChevronLeft, Loader2, Sparkles } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { fetchProfile } from "@/lib/identity";
import { onAuthChange, readAuthUser } from "@/lib/auth-storage";
import type { ProfileRecord } from "@/lib/types";

export default function SocialGuidePage() {
    const [profile, setProfile] = useState<ProfileRecord | null>(null);
    const [loading, setLoading] = useState(true);

    const loadData = async () => {
        const auth = readAuthUser();
        if (auth?.userId) {
            try {
                const data = await fetchProfile(auth.userId, auth.campusId || null);
                setProfile(data);
            } catch (err) {
                console.error("Failed to load profile for guide", err);
            }
        }
        setLoading(false);
    };

    useEffect(() => {
        loadData();
        return onAuthChange(loadData);
    }, []);

    return (
        <main className="min-h-screen bg-[#f8fafc] dark:bg-slate-950 pb-20">
            {/* Minimalist Top Nav */}
            <div className="sticky top-0 z-50 bg-white/80 dark:bg-slate-950/80 backdrop-blur-xl border-b border-slate-200/50 dark:border-slate-800/50">
                <div className="mx-auto max-w-7xl px-4 py-4 md:px-8 flex items-center justify-between">
                    <Link
                        href="/socials"
                        className="group flex items-center gap-2 text-slate-500 hover:text-indigo-600 transition-colors"
                    >
                        <div className="p-2 rounded-xl group-hover:bg-indigo-50 transition-colors">
                            <ChevronLeft size={20} />
                        </div>
                        <span className="font-bold text-sm tracking-tight text-slate-600 dark:text-slate-400 group-hover:text-indigo-600">Back to Socials</span>
                    </Link>

                    <div className="hidden md:block">
                        <span className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400">Reputation & Discovery System</span>
                    </div>
                </div>
            </div>

            {/* Content Wrapper */}
            <div className="mx-auto max-w-7xl px-4 pt-12 md:px-8">
                <div className="mb-12">
                    <div className="flex items-center gap-3 mb-4">
                        <div className="h-1 bg-indigo-600 w-12 rounded-full" />
                        <span className="text-xs font-black uppercase tracking-widest text-indigo-600">Personal Codex</span>
                    </div>
                    <h1 className="text-6xl font-black text-slate-900 dark:text-white tracking-tighter mb-4">
                        Master Your Influence
                    </h1>
                    <p className="text-xl text-slate-500 font-medium max-w-2xl leading-relaxed">
                        A comprehensive roadmap and guide to unlocking your full potential within the UniHood campus network.
                    </p>
                </div>

                {loading ? (
                    <div className="h-[400px] flex flex-col items-center justify-center bg-white dark:bg-slate-900 rounded-[40px] border border-dashed border-slate-200 dark:border-slate-800">
                        <Loader2 className="h-10 w-10 text-indigo-600 animate-spin mb-4" />
                        <p className="text-sm font-bold text-slate-500">Syncing your social progress...</p>
                    </div>
                ) : profile ? (
                    <div className="space-y-16 animate-in fade-in slide-in-from-bottom-8 duration-1000">
                        <SocialRoadmap
                            currentLevel={profile.level}
                            currentXp={profile.xp}
                            nextLevelXp={profile.next_level_xp}
                        />

                        <div className="relative">
                            <div className="absolute inset-0 flex items-center" aria-hidden="true">
                                <div className="w-full border-t border-slate-200 dark:border-slate-800"></div>
                            </div>
                            <div className="relative flex justify-center">
                                <span className="bg-[#f8fafc] dark:bg-slate-950 px-6 text-xs font-black uppercase tracking-widest text-slate-400 flex items-center gap-2">
                                    <Sparkles size={14} className="text-indigo-500" />
                                    Detailed Knowledge Base
                                </span>
                            </div>
                        </div>

                        <SocialScoreGuideContent />
                    </div>
                ) : (
                    <div className="p-12 text-center bg-white dark:bg-slate-900 rounded-[40px] border border-slate-200 dark:border-slate-800">
                        <h4 className="text-xl font-bold text-slate-900 dark:text-white">Sign in to see your roadmap</h4>
                        <p className="text-slate-500 mt-2">Personal progress tracking is only available for registered students.</p>
                        <Link href="/auth/login" className="mt-6 inline-block px-8 py-3 bg-indigo-600 text-white font-bold rounded-2xl hover:scale-105 transition-transform">Get Started</Link>
                    </div>
                )}

                {/* Footer Section */}
                <div className="mt-20 text-center border-t border-slate-200 dark:border-slate-800 pt-16">
                    <p className="text-slate-400 text-sm font-medium">
                        UniHood Social Reputation System v2.5 • Personalized Edition
                    </p>
                    <div className="flex justify-center gap-8 mt-6">
                        <a href="#" className="text-xs font-bold text-indigo-500 hover:underline tracking-tight">Community Guidelines</a>
                        <a href="#" className="text-xs font-bold text-indigo-500 hover:underline tracking-tight">Safety Center</a>
                        <a href="#" className="text-xs font-bold text-indigo-500 hover:underline tracking-tight">XP Policy</a>
                    </div>
                </div>
            </div>
        </main>
    );
}
