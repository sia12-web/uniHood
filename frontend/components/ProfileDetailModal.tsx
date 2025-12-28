"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import { X, MessageCircle, UserPlus, Instagram, Linkedin, Loader2, MapPin, Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";
import { useProfileScroll, cardVariants } from "@/hooks/use-profile-scroll";
import { NearbyUser, DiscoveryProfile } from "@/lib/types";
import { usePresenceForUser } from "@/hooks/presence/use-presence";
import { apiFetch } from "@/app/lib/http/client";
import { motion, AnimatePresence } from "framer-motion";
import { LevelBadge } from "@/components/xp/LevelBadge";

interface ProfileDetailModalProps {
    user: NearbyUser | null;
    isOpen: boolean;
    onClose: () => void;
    isFriend: boolean;
    isInvited: boolean;
    onInvite: () => void;
    onChat: () => void;
    invitePending: boolean;
}

export function ProfileDetailModal({
    user,
    isOpen,
    onClose,
    isFriend,
    isInvited,
    onInvite,
    onChat,
    invitePending
}: ProfileDetailModalProps) {
    return (
        <AnimatePresence>
            {isOpen && user && (
                <ProfileDetailContent
                    user={user}
                    onClose={onClose}
                    isFriend={isFriend}
                    isInvited={isInvited}
                    onInvite={onInvite}
                    onChat={onChat}
                    invitePending={invitePending}
                />
            )}
        </AnimatePresence>
    );
}

function ProfileDetailContent({
    user,
    onClose,
    isFriend,
    isInvited,
    onInvite,
    onChat,
    invitePending
}: {
    user: NearbyUser;
    onClose: () => void;
    isFriend: boolean;
    isInvited: boolean;
    onInvite: () => void;
    onChat: () => void;
    invitePending: boolean;
}) {
    const presence = usePresenceForUser(user.user_id);
    const isOnline = presence?.online ?? user.is_online ?? false;
    const { containerRef, headerY, avatarScale, avatarY, backdropBlur, backdropBrightness } = useProfileScroll();

    const [discoveryProfile, setDiscoveryProfile] = useState<DiscoveryProfile | null>(null);

    useEffect(() => {
        apiFetch<DiscoveryProfile>(`/discovery/profile/${user.user_id}`)
            .then(res => setDiscoveryProfile(res))
            .catch(() => null);
    }, [user.user_id]);

    const avatarUrl = user.avatar_url;
    const initial = (user.display_name || "U")[0].toUpperCase();

    const getPrompts = () => {
        if (!discoveryProfile) return [];
        const prompts: { k: string, v: unknown }[] = [];
        ['core_identity', 'personality', 'dating_adjacent', 'playful'].forEach(cat => {
            const section = (discoveryProfile as Record<string, unknown>)[cat] as Record<string, unknown> | undefined;
            if (section) {
                Object.entries(section).forEach(([k, v]) => {
                    if (v) prompts.push({ k: k.replace(/_/g, ' '), v });
                });
            }
        });
        return prompts;
    };

    const prompts = getPrompts();
    const gallery = user.gallery || [];

    return (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-0 sm:p-4 font-sans">
            {/* Backdrop */}
            <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                style={{ backdropFilter: backdropBlur, filter: backdropBrightness }}
                className="absolute inset-0 bg-black/40"
                onClick={onClose}
            />

            {/* Modal Body */}
            <motion.div
                className="relative flex h-full w-full max-w-lg flex-col overflow-hidden bg-white sm:rounded-[2rem] shadow-2xl"
                initial={{ y: "100%", opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                exit={{ y: "100%", opacity: 0 }}
                transition={{ type: "spring", damping: 30, stiffness: 300, mass: 0.8 }}
            >
                {/* Close Button (Floating) */}
                <button
                    onClick={onClose}
                    className="absolute right-5 top-5 z-50 rounded-full bg-black/20 p-2 text-white/90 backdrop-blur-md hover:bg-black/40 transition active:scale-95 cursor-pointer"
                >
                    <X size={24} />
                </button>

                {/* Main Scroll Container */}
                <div ref={containerRef} className="flex-1 overflow-y-auto scroll-smooth bg-white pb-24 scrollbar-hide">
                    {/* 1. HERO IMAGE (Avatar) */}
                    <motion.div
                        className="relative aspect-[3/4] w-full bg-slate-200 overflow-hidden"
                        style={{ y: headerY }}
                    >
                        {avatarUrl ? (
                            <motion.div style={{ scale: avatarScale, y: avatarY }} className="h-full w-full">
                                <Image src={avatarUrl} alt={user.display_name} fill className="object-cover" priority />
                            </motion.div>
                        ) : (
                            <div className="flex h-full w-full items-center justify-center bg-indigo-50 text-6xl font-black text-indigo-200">
                                {initial}
                            </div>
                        )}

                        {/* Name Overlay */}
                        <div className="absolute bottom-0 inset-x-0 bg-gradient-to-t from-black/90 via-black/40 to-transparent pt-32 pb-6 px-6">
                            <h1 className="text-4xl font-black tracking-tight text-white mb-1 flex items-center gap-2">
                                {user.display_name}
                                {user.level ? <LevelBadge level={user.level} size="sm" className="bg-white/20 text-white border-white/10" /> : null}
                                {isOnline && <div className="h-3 w-3 rounded-full bg-emerald-500 shadow-[0_0_10px_rgba(16,185,129,0.8)]" />}
                            </h1>
                            <p className="text-lg font-medium text-white/90 flex items-center gap-2 truncate">
                                @{user.handle}
                            </p>
                        </div>
                    </motion.div>

                    {/* 2. CORE INFO & ACTIONS */}
                    <div className="px-6 py-6 space-y-6">
                        {/* Badges */}
                        <div className="flex flex-wrap gap-2 text-sm font-semibold">
                            {user.campus_name && (
                                <div className="px-3 py-1.5 rounded-full bg-slate-100 text-slate-700 flex items-center gap-1.5 border border-slate-200">
                                    <MapPin size={14} /> {user.campus_name}
                                </div>
                            )}
                            {user.major && user.major !== "None" && (
                                <div className="px-3 py-1.5 rounded-full bg-slate-100 text-slate-700 flex items-center gap-1.5 border border-slate-200">
                                    <Sparkles size={14} className="text-amber-500" /> {user.major}
                                </div>
                            )}
                            {user.graduation_year && (
                                <div className="px-3 py-1.5 rounded-full bg-slate-100 text-slate-700 border border-slate-200">
                                    &apos;{String(user.graduation_year).slice(-2)}
                                </div>
                            )}
                        </div>

                        {/* Action Buttons */}
                        <div className="flex flex-wrap items-center gap-3">
                            {isFriend ? (
                                <button
                                    onClick={onChat}
                                    className="flex-1 flex items-center justify-center gap-2 rounded-xl bg-indigo-600 px-8 py-3.5 text-base font-bold text-white shadow-lg shadow-indigo-200 hover:bg-indigo-700 active:scale-95 transition"
                                >
                                    <MessageCircle size={20} /> Send Message
                                </button>
                            ) : (
                                <button
                                    onClick={() => !isInvited && onInvite()}
                                    disabled={isInvited || invitePending}
                                    className={cn(
                                        "flex-1 flex items-center justify-center gap-2 rounded-xl px-8 py-3.5 text-base font-bold border-2 transition active:scale-95",
                                        isInvited
                                            ? "bg-slate-50 text-slate-400 border-slate-200 cursor-not-allowed"
                                            : "bg-white text-slate-900 border-slate-900 hover:bg-slate-900 hover:text-white"
                                    )}
                                >
                                    {invitePending ? <Loader2 className="animate-spin" size={20} /> : <UserPlus size={20} />}
                                    {isInvited ? "Request Sent" : "Connect"}
                                </button>
                            )}

                            {/* Socials */}
                            {user.social_links?.instagram && (
                                <a href={`https://instagram.com/${user.social_links.instagram.replace('@', '')}`} target="_blank" className="p-3.5 rounded-xl bg-slate-100 text-slate-600 hover:bg-pink-50 hover:text-pink-600 transition">
                                    <Instagram size={24} />
                                </a>
                            )}
                            {user.social_links?.linkedin && (
                                <a href={user.social_links.linkedin} target="_blank" className="p-3.5 rounded-xl bg-slate-100 text-slate-600 hover:bg-blue-50 hover:text-blue-600 transition">
                                    <Linkedin size={24} />
                                </a>
                            )}
                        </div>
                    </div>

                    {/* 3. CONTENT FLOW */}
                    <div className="px-6 space-y-8 pb-10">
                        {/* Bio */}
                        {user.bio && (
                            <motion.div
                                variants={cardVariants}
                                initial="hidden"
                                whileInView="visible"
                                viewport={{ once: true }}
                                custom={1}
                            >
                                <h3 className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-2">About Me</h3>
                                <p className="text-xl text-slate-800 leading-relaxed font-medium">{user.bio}</p>
                            </motion.div>
                        )}

                        {/* Vibe Check (Compatibility) */}
                        {user.compatibility_hint && (
                            <motion.div
                                className="p-4 rounded-2xl bg-gradient-to-r from-violet-500 to-fuchsia-500 text-white shadow-lg shadow-purple-200"
                                variants={cardVariants}
                                initial="hidden"
                                whileInView="visible"
                                viewport={{ once: true }}
                                custom={1.5}
                            >
                                <div className="flex items-center gap-2 font-bold text-xs uppercase tracking-widest text-white/80 mb-2">
                                    <Sparkles size={12} /> Vibe Check
                                </div>
                                <p className="text-lg font-bold leading-relaxed">
                                    &quot;{user.compatibility_hint}&quot;
                                </p>
                            </motion.div>
                        )}

                        {/* Passions */}
                        {user.passions && user.passions.length > 0 && (
                            <motion.div
                                variants={cardVariants}
                                initial="hidden"
                                whileInView="visible"
                                viewport={{ once: true }}
                                custom={2}
                            >
                                <h3 className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-3">Passions</h3>
                                <div className="flex flex-wrap gap-2">
                                    {user.passions.map(p => (
                                        <span key={p} className="px-4 py-2 rounded-lg bg-white border-2 border-slate-100 text-slate-700 font-bold text-sm">
                                            {p}
                                        </span>
                                    ))}
                                </div>
                            </motion.div>
                        )}

                        {/* Interleaved Prompts & Photos */}
                        <div className="space-y-8">
                            {prompts.map((prompt, i) => (
                                <motion.div
                                    key={`prompt-${i}`}
                                    className="space-y-8"
                                    variants={cardVariants}
                                    initial="hidden"
                                    whileInView="visible"
                                    viewport={{ once: true }}
                                    custom={i + 3}
                                >
                                    {/* The Prompt */}
                                    <div className="pl-4 border-l-4 border-indigo-200">
                                        <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-2">{prompt.k}</p>
                                        <p className="text-2xl font-serif text-slate-900 leading-tight">
                                            {String(prompt.v)}
                                        </p>
                                    </div>

                                    {/* Corresponding Photo (if available) - Interleave after every prompt */}
                                    {gallery[i] && (
                                        <div className="relative aspect-[3/4] w-full bg-slate-100 rounded-3xl overflow-hidden shadow-sm">
                                            <Image
                                                src={gallery[i].url}
                                                alt="Gallery"
                                                fill
                                                className="object-cover hover:scale-105 transition duration-500"
                                            />
                                        </div>
                                    )}
                                </motion.div>
                            ))}

                            {/* Any remaining Photos if there are more photos than prompts */}
                            {gallery.length > prompts.length && (
                                <div className="grid grid-cols-2 gap-2 mt-4">
                                    {gallery.slice(prompts.length).map((img, idx) => (
                                        <motion.div
                                            key={img.key}
                                            className="relative aspect-square rounded-2xl overflow-hidden bg-slate-100"
                                            variants={cardVariants}
                                            initial="hidden"
                                            whileInView="visible"
                                            viewport={{ once: true }}
                                            custom={idx}
                                        >
                                            <Image src={img.url} alt="" fill className="object-cover" />
                                        </motion.div>
                                    ))}
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            </motion.div>
        </div>
    );
}
