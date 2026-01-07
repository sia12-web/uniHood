"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import { X, MessageCircle, UserPlus, Instagram, Linkedin, Loader2, MapPin, Sparkles, Ruler } from "lucide-react";
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

    const [selectedImage, setSelectedImage] = useState<string | null>(null);
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

    const prompts = (user.top_prompts && user.top_prompts.length > 0)
        ? user.top_prompts.map(p => ({ k: p.question, v: p.answer }))
        : getPrompts();
    const gallery = user.gallery || [];
    const remainingImages = gallery.slice(prompts.length);

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
                        className="relative aspect-[3/4] w-full bg-slate-200 overflow-hidden cursor-zoom-in group"
                        style={{ y: headerY }}
                        onClick={() => avatarUrl && setSelectedImage(avatarUrl)}
                    >
                        {avatarUrl ? (
                            <motion.div style={{ scale: avatarScale, y: avatarY }} className="h-full w-full">
                                <Image src={avatarUrl} alt={user.display_name} fill className="object-cover transition group-hover:scale-105 duration-700" priority sizes="(max-width: 768px) 100vw, 500px" />
                            </motion.div>
                        ) : (
                            <div className="flex h-full w-full items-center justify-center bg-indigo-50 text-6xl font-black text-indigo-200">
                                {initial}
                            </div>
                        )}

                        {/* Name Overlay */}
                        <div className="absolute bottom-0 inset-x-0 bg-gradient-to-t from-black/90 via-black/40 to-transparent pt-32 pb-6 px-6 pointer-events-none">
                            <h1 className="text-4xl font-black tracking-tight text-white mb-1 flex items-center gap-2">
                                {user.display_name}{user.age ? `, ${user.age}` : ""}
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
                            {user.hometown && (
                                <div className="px-3 py-1.5 rounded-full bg-slate-100 text-slate-700 flex items-center gap-1.5 border border-slate-200">
                                    <MapPin size={14} className="text-rose-500" /> {user.hometown}
                                </div>
                            )}
                            {user.languages && user.languages.length > 0 && (
                                <div className="px-3 py-1.5 rounded-full bg-slate-100 text-slate-700 border border-slate-200">
                                    🗣️ {user.languages.join(", ")}
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

                        {/* DETAILED IDENTITY & VIBE CHECK */}
                        {(user.relationship_status || user.sexual_orientation || user.looking_for || user.lifestyle) && (
                            <motion.div
                                variants={cardVariants}
                                initial="hidden"
                                whileInView="visible"
                                viewport={{ once: true }}
                                custom={1.2}
                                className="grid gap-4"
                            >
                                <h3 className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-1 flex items-center gap-2">
                                    <Sparkles size={14} className="text-indigo-500" /> The Vibe Check
                                </h3>

                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                    {/* Identity Card */}
                                    <div className="p-5 rounded-2xl bg-slate-50 border border-slate-100 space-y-4">
                                        <div className="flex items-center gap-2 text-slate-900 font-bold border-b border-slate-200 pb-2">
                                            <span className="text-xl">🪪</span> Identity
                                        </div>
                                        <div className="space-y-3">
                                            {user.relationship_status && (
                                                <div className="flex justify-between items-center text-sm">
                                                    <span className="text-slate-500 font-medium">Status</span>
                                                    <span className="font-bold text-slate-900 bg-white px-2 py-1 rounded-md border border-slate-200">{user.relationship_status}</span>
                                                </div>
                                            )}
                                            {user.sexual_orientation && user.sexual_orientation !== 'Prefer not to say' && (
                                                <div className="flex justify-between items-center text-sm">
                                                    <span className="text-slate-500 font-medium">Orientation</span>
                                                    <span className="font-bold text-slate-900 bg-white px-2 py-1 rounded-md border border-slate-200">{user.sexual_orientation}</span>
                                                </div>
                                            )}
                                            {user.height && (
                                                <div className="flex justify-between items-center text-sm">
                                                    <span className="text-slate-500 font-medium flex items-center gap-1.5"><Ruler size={14} className="text-slate-400" /> Height</span>
                                                    <span className="font-bold text-slate-900 bg-white px-2 py-1 rounded-md border border-slate-200">{user.height} cm</span>
                                                </div>
                                            )}
                                            {user.looking_for && user.looking_for.length > 0 && (
                                                <div>
                                                    <span className="text-slate-500 font-medium text-sm block mb-1.5">Looking For</span>
                                                    <div className="flex flex-wrap gap-1.5">
                                                        {user.looking_for.map(l => (
                                                            <span key={l} className="text-xs font-bold bg-blue-50 text-blue-700 px-2 py-1 rounded-md border border-blue-100">
                                                                {l}
                                                            </span>
                                                        ))}
                                                    </div>
                                                </div>
                                            )}
                                        </div>
                                    </div>

                                    {/* Lifestyle Card */}
                                    {user.lifestyle && (
                                        <div className="p-5 rounded-2xl bg-slate-50 border border-slate-100 space-y-4">
                                            <div className="flex items-center gap-2 text-slate-900 font-bold border-b border-slate-200 pb-2">
                                                <span className="text-xl">⚡</span> Lifestyle
                                            </div>
                                            <div className="space-y-3">
                                                {user.lifestyle.drinking && user.lifestyle.drinking !== 'No' && (
                                                    <div className="flex justify-between items-center text-sm">
                                                        <span className="text-slate-500 font-medium">Drinking</span>
                                                        <span className="font-bold text-slate-900">{user.lifestyle.drinking}</span>
                                                    </div>
                                                )}
                                                {user.lifestyle.smoking && user.lifestyle.smoking !== 'No' && (
                                                    <div className="flex justify-between items-center text-sm">
                                                        <span className="text-slate-500 font-medium">Smoking</span>
                                                        <span className="font-bold text-slate-900">{user.lifestyle.smoking}</span>
                                                    </div>
                                                )}
                                                {user.lifestyle.workout && user.lifestyle.workout !== 'Never' && (
                                                    <div className="flex justify-between items-center text-sm">
                                                        <span className="text-slate-500 font-medium">Workout</span>
                                                        <span className="font-bold text-slate-900">{user.lifestyle.workout}</span>
                                                    </div>
                                                )}
                                                {/* Fallback to show something if only 'No'/'Never' are selected, or empty */}
                                                {(!user.lifestyle.drinking || user.lifestyle.drinking === 'No') &&
                                                    (!user.lifestyle.smoking || user.lifestyle.smoking === 'No') &&
                                                    (!user.lifestyle.workout || user.lifestyle.workout === 'Never') && (
                                                        <div className="text-center text-slate-400 text-sm italic py-2">
                                                            Straight edge lifestyle 🌿
                                                        </div>
                                                    )}
                                            </div>
                                        </div>
                                    )}
                                </div>
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

                            {/* Remaining Photos Grid - REFACTORED */}
                            {remainingImages.length > 0 && (
                                <div className={cn(
                                    "grid gap-2 mt-6",
                                    remainingImages.length === 1 ? "grid-cols-1" : "grid-cols-2"
                                )}>
                                    {remainingImages.map((img, idx) => (
                                        <motion.div
                                            key={img.key}
                                            className={cn(
                                                "relative overflow-hidden rounded-2xl bg-slate-100 cursor-zoom-in shadow-sm",
                                                // If odd number > 1, make the first one span full width landscape
                                                remainingImages.length > 1 && remainingImages.length % 2 !== 0 && idx === 0 ? "col-span-2 aspect-[16/9]" :
                                                    // If exactly 1, make it generous portrait
                                                    remainingImages.length === 1 ? "aspect-[4/5]" :
                                                        // Default square
                                                        "aspect-square"
                                            )}
                                            variants={cardVariants}
                                            initial="hidden"
                                            whileInView="visible"
                                            viewport={{ once: true }}
                                            custom={idx}
                                            onClick={() => setSelectedImage(img.url)}
                                        >
                                            <Image
                                                src={img.url}
                                                alt=""
                                                fill
                                                className="object-cover hover:scale-105 transition duration-700"
                                                quality={95}
                                                sizes="(max-width: 768px) 100vw, 500px"
                                            />
                                        </motion.div>
                                    ))}
                                </div>
                            )}
                        </div>
                    </div>
                    {/* Lightbox Overlay */}
                    <AnimatePresence>
                        {selectedImage && (
                            <motion.div
                                initial={{ opacity: 0 }}
                                animate={{ opacity: 1 }}
                                exit={{ opacity: 0 }}
                                className="fixed inset-0 z-[150] bg-black/95 flex items-center justify-center p-4 backdrop-blur-sm"
                                onClick={() => setSelectedImage(null)}
                            >
                                <button className="absolute top-4 right-4 text-white/70 hover:text-white p-2">
                                    <X size={32} />
                                </button>
                                <motion.div
                                    initial={{ scale: 0.9, opacity: 0 }}
                                    animate={{ scale: 1, opacity: 1 }}
                                    exit={{ scale: 0.9, opacity: 0 }}
                                    className="relative w-full max-w-4xl max-h-[90vh] aspect-[3/4] md:aspect-[16/9]"
                                    onClick={(e) => e.stopPropagation()}
                                >
                                    <Image
                                        src={selectedImage}
                                        alt="Full view"
                                        fill
                                        className="object-contain"
                                        quality={100}
                                        priority
                                    />
                                </motion.div>
                            </motion.div>
                        )}
                    </AnimatePresence>
                </div>
            </motion.div>
        </div>
    );
}
