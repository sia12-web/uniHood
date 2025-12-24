"use client";

import { useMemo, useRef } from "react";
import Image from "next/image";
import { motion } from "framer-motion";
import {
    MessageCircle,
    UserPlus,
    MapPin,
    GraduationCap,
    Sparkles,
    Heart,
    Quote
} from "lucide-react";
import { cn } from "@/lib/utils";
import { NearbyUser } from "@/lib/types";
import { formatDistance } from "@/lib/geo";

interface ParallaxProfileCardProps {
    user: NearbyUser;
    isFriend: boolean;
    isInvited: boolean;
    onInvite: () => void;
    onChat: () => void;
    onProfileClick: () => void;
    invitePending: boolean;
    variant?: "full" | "preview";
    myCourses?: string[];
}

export function ParallaxProfileCard({
    user,
    isFriend,
    isInvited,
    onInvite,
    onChat,
    onProfileClick,
    invitePending,
    variant = "full",
    myCourses = []
}: ParallaxProfileCardProps) {
    const containerRef = useRef<HTMLDivElement>(null);

    // Gather all unique images
    const images = useMemo(() => {
        const set = new Set<string>();
        user.gallery?.forEach(g => { if (g.url) set.add(g.url); });
        if (user.avatar_url) set.add(user.avatar_url);
        // Banner removed as per request to cleaner look
        return Array.from(set).filter(Boolean);
    }, [user]);

    const primaryImage = images[0] || null;
    // Secondary and tertiary images are available but not used in current layout
    // const secondaryImage = images[1] || primaryImage;
    // const tertiaryImage = images[2] || primaryImage;

    const distance = formatDistance(user.distance_m ?? null);
    const isPreview = variant === "preview";

    const commonCourses = useMemo(() => {
        if (!user.courses || !myCourses.length) return [];
        const mySet = new Set(myCourses.map(c => c.toUpperCase()));
        return user.courses.filter(c => mySet.has(c.toUpperCase()));
    }, [user.courses, myCourses]);

    const isClassmate = commonCourses.length > 0;

    return (
        <div
            className={cn(
                "relative w-full overflow-hidden bg-slate-950 shadow-2xl ring-1 ring-white/10 transition-all duration-300",
                isPreview ? "aspect-[3/4]" : "aspect-[9/16]",
                isPreview ? "rounded-3xl cursor-pointer hover:shadow-rose-500/10 hover:ring-rose-500/30" : "rounded-3xl",
                isPreview && "group"
            )}
            onClick={isPreview ? onProfileClick : undefined}
        >
            {/* Scrollable Container (Disabled in preview) */}
            <div
                ref={containerRef}
                className={cn(
                    "h-full w-full snap-y snap-mandatory scroll-smooth hide-scrollbar",
                    isPreview ? "overflow-hidden" : "overflow-y-auto"
                )}
            >

                {/* SECTION 1: HERO (Snap Start) */}
                <section className="relative h-full w-full snap-start shrink-0">
                    {/* Background Image */}
                    {primaryImage ? (
                        <div className="absolute inset-0">
                            <Image
                                src={primaryImage}
                                alt={user.display_name}
                                fill
                                className={cn(
                                    "object-cover transition-transform duration-700",
                                    isPreview && "group-hover:scale-105"
                                )}
                                priority
                            />
                            <div className="absolute inset-0 bg-gradient-to-b from-black/20 via-transparent to-slate-950/90" />
                        </div>
                    ) : (
                        <div className="absolute inset-0 flex items-center justify-center bg-gradient-to-br from-indigo-500 to-rose-500">
                            <div className="text-center text-white/20">
                                <span className="text-9xl font-black uppercase tracking-tighter block leading-none">
                                    {(user.display_name || "?")[0]}
                                </span>
                            </div>
                        </div>
                    )}

                    {/* OVERLAY CONTENT */}
                    <div className={cn(
                        "absolute inset-0 flex flex-col justify-end p-6 text-white",
                        isPreview ? "pb-6" : "pb-24"
                    )}>
                        {/* Name & Basic Info */}
                        <motion.div
                            initial={{ opacity: 0, y: 20 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ delay: 0.1 }}
                        >
                            <div className="flex items-end justify-between gap-2 mb-2">
                                <div>
                                    <h1 className="text-4xl font-black tracking-tight drop-shadow-lg leading-none">
                                        {user.display_name}
                                    </h1>
                                    <div className="flex items-center gap-2 mt-2 text-sm font-medium text-slate-200">
                                        {user.graduation_year && (
                                            <span className="bg-white/20 px-2 py-0.5 rounded-md backdrop-blur-sm border border-white/10">
                                                Class of &apos;{String(user.graduation_year).slice(-2)}
                                            </span>
                                        )}
                                        {isClassmate && (
                                            <span className="bg-indigo-500/80 px-2 py-0.5 rounded-md backdrop-blur-sm border border-indigo-400/50 text-white font-bold flex items-center gap-1">
                                                <GraduationCap size={12} /> Classmate
                                            </span>
                                        )}
                                        {distance && (
                                            <span className="flex items-center gap-1 opacity-90">
                                                <MapPin size={14} className="text-emerald-400" />
                                                {distance}
                                            </span>
                                        )}
                                    </div>
                                </div>
                            </div>

                            {user.major && user.major.toLowerCase() !== "none" && (
                                <div className="text-lg font-medium text-rose-200 drop-shadow-md flex items-center gap-2 mb-4">
                                    <GraduationCap size={20} />
                                    {user.major}
                                </div>
                            )}

                            {/* Hero Prompt (First one prominently displayed) */}
                            {!isPreview && user.top_prompts && user.top_prompts.length > 0 && (
                                <div className="mt-4 p-4 rounded-2xl bg-white/10 backdrop-blur-md border border-white/10 shadow-lg">
                                    <p className="text-xs font-bold uppercase tracking-widest text-indigo-300 mb-1">
                                        {user.top_prompts[0].question}
                                    </p>
                                    <p className="text-base font-semibold leading-snug">
                                        “{user.top_prompts[0].answer}”
                                    </p>
                                </div>
                            )}

                            {/* Vibe Tags Preview for Grid */}
                            {isPreview && user.vibe_tags && user.vibe_tags.length > 0 && (
                                <div className="flex flex-wrap gap-1 mt-3">
                                    {user.vibe_tags.slice(0, 3).map(tag => (
                                        <span key={tag} className="text-[10px] uppercase font-bold tracking-wider bg-white/10 text-white px-1.5 py-0.5 rounded-md backdrop-blur-sm border border-white/5">
                                            {tag}
                                        </span>
                                    ))}
                                </div>
                            )}
                        </motion.div>

                        {/* Scroll Hint (Only Full Mode) */}
                        {!isPreview && (
                            <motion.div
                                className="absolute bottom-6 left-1/2 -translate-x-1/2 flex flex-col items-center gap-1 text-xs font-medium text-slate-400 opacity-70"
                                animate={{ y: [0, 5, 0] }}
                                transition={{ repeat: Infinity, duration: 2 }}
                            >
                                <div className="w-5 h-8 border-2 border-slate-400 rounded-full flex justify-center pt-1">
                                    <div className="w-1 h-2 bg-slate-400 rounded-full" />
                                </div>
                            </motion.div>
                        )}
                    </div>
                </section>

                {/* Following Sections only rendered if not preview to save DOM */}
                {!isPreview && (
                    <>
                        {/* SECTION 2: BIO & VIBES (Snap Center) */}
                        <section className="relative min-h-[50%] w-full bg-slate-950 px-6 py-12 snap-center flex flex-col justify-center">
                            <div className="space-y-8">
                                {/* Bio */}
                                {user.bio ? (
                                    <div className="space-y-3">
                                        <h3 className="text-xs font-bold uppercase tracking-widest text-slate-500 flex items-center gap-2">
                                            <Sparkles size={14} className="text-purple-500" /> About Me
                                        </h3>
                                        <p className="text-xl leading-relaxed text-slate-200 font-medium">
                                            {user.bio}
                                        </p>
                                    </div>
                                ) : null}

                                {/* Vibe Tags */}
                                {user.vibe_tags && user.vibe_tags.length > 0 && (
                                    <div className="space-y-3">
                                        <div className="flex flex-wrap gap-2">
                                            {user.vibe_tags.slice(0, 5).map(tag => ( // Limit to 5 cool ones
                                                <span
                                                    key={tag}
                                                    className="px-4 py-2 rounded-2xl bg-slate-900 border border-slate-800 text-sm font-bold text-slate-300 shadow-sm hover:border-slate-700 transition"
                                                >
                                                    {tag}
                                                </span>
                                            ))}
                                        </div>
                                    </div>
                                )}
                            </div>
                        </section>

                        {/* SECTION 2.5: COURSES (Snap Center) */}
                        {user.courses && user.courses.length > 0 && (
                            <section className="relative min-h-[40%] w-full bg-slate-950 px-6 py-12 snap-center flex flex-col justify-center">
                                <h3 className="text-xs font-bold uppercase tracking-widest text-slate-500 mb-6 flex items-center gap-2">
                                    <GraduationCap size={14} className="text-indigo-500" /> Courses
                                </h3>
                                <div className="flex flex-wrap gap-2">
                                    {user.courses.map((course) => {
                                        const isShared = commonCourses.some(c => c.toUpperCase() === course.toUpperCase());
                                        return (
                                            <span
                                                key={course}
                                                className={cn(
                                                    "px-4 py-2 rounded-xl text-sm font-bold border shadow-sm transition",
                                                    isShared
                                                        ? "bg-indigo-500/20 border-indigo-500/50 text-indigo-300"
                                                        : "bg-slate-900 border-slate-800 text-slate-300"
                                                )}
                                            >
                                                {course} {isShared && "✨"}
                                            </span>
                                        );
                                    })}
                                </div>
                            </section>
                        )}

                        {/* SECTION 3: IMMERSIVE PROMPT (Snap Start) */}
                        {user.top_prompts && user.top_prompts[1] && (
                            <section className="relative h-full w-full snap-start overflow-hidden flex items-center justify-center bg-slate-900">
                                {/* Parallax BG */}
                                {/* Parallax BG - Replaced with Gradient */}
                                <div className="absolute inset-0 bg-gradient-to-br from-indigo-900 to-slate-900">
                                    <div className="absolute inset-0 opacity-20 bg-[radial-gradient(circle_at_center,_var(--tw-gradient-stops))] from-white/10 to-transparent" />
                                </div>

                                <div className="relative z-10 p-8 max-w-sm w-full mx-auto">
                                    <div className="bg-white/10 backdrop-blur-xl border border-white/20 p-8 rounded-3xl shadow-2xl transform rotate-1">
                                        <h4 className="text-xs font-bold uppercase tracking-widest text-indigo-300 mb-4 opacity-80">
                                            {user.top_prompts[1].question}
                                        </h4>
                                        <p className="text-2xl font-bold text-white leading-tight">
                                            {user.top_prompts[1].answer}
                                        </p>
                                        <div className="mt-4 flex justify-end">
                                            <div className="h-8 w-8 rounded-full bg-indigo-500 flex items-center justify-center text-white">
                                                <Quote size={14} fill="currentColor" />
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </section>
                        )}

                        {/* SECTION 4: INTERESTS CLOUD (Snap Center) */}
                        {(user.interests || user.passions) && (
                            <section className="relative min-h-[40%] w-full bg-slate-950 px-6 py-12 snap-center flex flex-col justify-center text-center">
                                <h3 className="text-xs font-bold uppercase tracking-widest text-slate-500 mb-6 flex items-center justify-center gap-2">
                                    <Heart size={14} className="text-rose-500" /> Passions
                                </h3>
                                <div className="flex flex-wrap justify-center gap-2">
                                    {[...(user.interests || []), ...(user.passions || [])].slice(0, 10).map((interest, i) => (
                                        <span
                                            key={i}
                                            className="px-4 py-2 rounded-full bg-gradient-to-br from-slate-800 to-slate-900 border border-slate-700 text-sm font-medium text-slate-300"
                                        >
                                            {interest}
                                        </span>
                                    ))}
                                </div>
                            </section>
                        )}

                        {/* SECTION 5: FINAL PROMPT / GALLERY (Snap Start) */}
                        {user.top_prompts && user.top_prompts[2] && (
                            <section className="relative h-[80%] w-full snap-start overflow-hidden flex items-end bg-slate-900">
                                <div className="absolute inset-0 bg-gradient-to-tr from-slate-900 to-emerald-950">
                                    <div className="absolute top-0 right-0 w-64 h-64 bg-emerald-500/10 rounded-full blur-3xl transform translate-x-1/2 -translate-y-1/2" />
                                </div>
                                <div className="relative z-10 w-full p-8 pb-32 bg-gradient-to-t from-slate-950 to-transparent">
                                    <span className="text-emerald-400 text-xs font-bold uppercase tracking-widest mb-2 block">
                                        {user.top_prompts[2].question}
                                    </span>
                                    <p className="text-2xl font-bold text-white">
                                        &quot;{user.top_prompts[2].answer}&quot;
                                    </p>
                                </div>
                            </section>
                        )}

                        <div className="h-24 w-full bg-slate-950 snap-end" />
                    </>
                )}
            </div>

            {/* FIXED ACTION BAR (Only in full mode) */}
            {!isPreview && (
                <div className="absolute bottom-0 left-0 right-0 p-4 bg-gradient-to-t from-black via-black/80 to-transparent z-20 backdrop-blur-[2px]">
                    <div className="flex gap-3">
                        {isFriend ? (
                            <button
                                onClick={(e) => {
                                    e.stopPropagation();
                                    onChat();
                                }}
                                className="flex-1 flex items-center justify-center gap-2 h-12 rounded-xl bg-white text-slate-950 font-bold hover:bg-slate-200 transition active:scale-95"
                            >
                                <MessageCircle size={18} />
                                Message
                            </button>
                        ) : (
                            <button
                                onClick={(e) => {
                                    e.stopPropagation();
                                    if (!isInvited) onInvite();
                                    // Auto-scroll to next? No, let user do it
                                }}
                                disabled={invitePending || isInvited}
                                className={cn(
                                    "flex-1 flex items-center justify-center gap-2 h-12 rounded-xl font-bold text-white transition active:scale-95 disabled:opacity-70 disabled:active:scale-100",
                                    isInvited
                                        ? "bg-slate-800 cursor-default"
                                        : "bg-gradient-to-r from-rose-600 to-indigo-600 shadow-lg shadow-rose-900/30 hover:shadow-xl hover:shadow-rose-900/40"
                                )}
                            >
                                {invitePending ? <div className="animate-spin rounded-full h-5 w-5 border-2 border-white/30 border-t-white" /> :
                                    isInvited ? "Request Sent" : <><UserPlus size={18} /> Connect</>
                                }
                            </button>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
}
