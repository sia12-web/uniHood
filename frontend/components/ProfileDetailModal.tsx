"use client";

import { useEffect, useState, useMemo } from "react";
import Image from "next/image";
import { X, CheckCircle2, MessageCircle, UserPlus, Instagram, Globe, Linkedin, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { NearbyUser } from "@/lib/types";
import { getMutualFriends, getUserSummary, getUserMeetups, MutualFriend, UserSummary } from "@/lib/profile-service";
import { MeetupResponse } from "@/lib/meetups";

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

function getCategoryImage(cat: string) {
    const map: Record<string, string> = {
        study: "https://images.unsplash.com/photo-1434030216411-0b793f4b4173?w=300&q=80",
        gym: "https://images.unsplash.com/photo-1534438327276-14e5300c3a48?w=300&q=80",
        food: "https://images.unsplash.com/photo-1504674900247-0877df9cc836?w=300&q=80",
        social: "https://images.unsplash.com/photo-1529156069898-49953e39b3ac?w=300&q=80",
        game: "https://images.unsplash.com/photo-1511512578047-dfb367046420?w=300&q=80",
        other: "https://images.unsplash.com/photo-1511632765486-a01980e01a18?w=300&q=80"
    };
    return map[cat] || map.other;
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
    const [isClosing, setIsClosing] = useState(false);
    const [activeTab, setActiveTab] = useState("About");

    // Data States
    const [mutuals, setMutuals] = useState<MutualFriend[]>([]);
    const [summary, setSummary] = useState<UserSummary | null>(null);
    const [meetups, setMeetups] = useState<MeetupResponse[]>([]);
    const [loadingExtras, setLoadingExtras] = useState(false);

    const handleClose = () => {
        setIsClosing(true);
        setTimeout(() => {
            onClose();
            setIsClosing(false);
            setMutuals([]);
            setSummary(null);
            setMeetups([]);
            setActiveTab("About");
        }, 200);
    };

    useEffect(() => {
        if (isOpen && user) {
            setLoadingExtras(true);
            Promise.allSettled([
                getMutualFriends(user.user_id),
                getUserSummary(user.user_id),
                getUserMeetups(user.user_id)
            ]).then(([resMutuals, resSummary, resMeetups]) => {
                if (resMutuals.status === 'fulfilled') setMutuals(resMutuals.value);
                if (resSummary.status === 'fulfilled') setSummary(resSummary.value);
                if (resMeetups.status === 'fulfilled') setMeetups(resMeetups.value);
                setLoadingExtras(false);
            });
        }
    }, [isOpen, user]);

    if (!isOpen || !user) return null;

    const bannerUrl = user.banner_url || "https://images.unsplash.com/photo-1541339907198-e08756dedf3f?q=80&w=1000&auto=format&fit=crop";
    const avatarUrl = user.avatar_url || "";
    const initial = (user.display_name || "U")[0].toUpperCase();

    // Calculate Level (Mock Logic based on score)
    const score = summary?.scores.overall || 0;
    const level = Math.floor(score / 200) + 1;
    const scoreProgress = (score % 200) / 200 * 100;

    return (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 sm:p-6 font-sans">
            <div
                className={cn(
                    "absolute inset-0 bg-black/60 backdrop-blur-sm transition-opacity duration-300",
                    isClosing ? "opacity-0" : "animate-in fade-in opacity-100"
                )}
                onClick={handleClose}
            />

            <div
                className={cn(
                    "relative flex h-full max-h-[850px] w-full max-w-5xl flex-col overflow-hidden rounded-xl bg-white shadow-2xl transition-all duration-300",
                    isClosing ? "scale-95 opacity-0" : "animate-in zoom-in-95 slide-in-from-bottom-4 duration-300"
                )}
            >
                {/* Banner Image */}
                <div className="relative h-48 w-full shrink-0 bg-slate-200 sm:h-64">
                    <button
                        onClick={handleClose}
                        className="absolute right-4 top-4 z-50 rounded-full bg-black/30 p-2 text-white backdrop-blur-md hover:bg-black/50 transition"
                    >
                        <X size={20} />
                    </button>
                    <Image
                        src={bannerUrl}
                        alt="Banner"
                        fill
                        className="object-cover"
                        priority
                    />
                </div>

                {/* Header Content Area */}
                <div className="relative px-8">
                    {/* Avatar */}
                    <div className="absolute -top-16 left-8 h-32 w-32 rounded-full border-[4px] border-white bg-white shadow-sm sm:h-40 sm:w-40 z-10">
                        <div className="relative h-full w-full rounded-full overflow-hidden bg-slate-100">
                            {avatarUrl ? (
                                <Image src={avatarUrl} alt={user.display_name} fill className="object-cover" />
                            ) : (
                                <div className="flex h-full w-full items-center justify-center bg-slate-100 text-4xl text-slate-400 font-bold">
                                    {initial}
                                </div>
                            )}
                        </div>
                        <div className="absolute bottom-2 right-2 h-6 w-6 rounded-full border-[3px] border-white bg-emerald-500"></div>
                    </div>

                    {/* Name & Actions Header */}
                    <div className="ml-32 pt-2 sm:ml-44 flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
                        <div>
                            <div className="flex items-center gap-2">
                                <h2 className="text-2xl font-bold text-slate-900">{user.display_name}</h2>
                                <span className="flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-700">
                                    <div className="h-1.5 w-1.5 rounded-full bg-emerald-500"></div>
                                    Online
                                </span>
                                <CheckCircle2 size={18} className="text-blue-500 fill-blue-50" />
                            </div>
                            <div className="flex items-center gap-2 text-slate-500 text-sm mt-1">
                                <span>@{user.handle}</span>
                                {isFriend && (
                                    <span className="rounded bg-slate-100 px-1.5 py-0.5 text-xs font-medium text-slate-600">Friend</span>
                                )}
                            </div>
                        </div>

                        <div className="flex items-center gap-3">
                            {isFriend ? (
                                <button
                                    onClick={onChat}
                                    className="flex items-center gap-2 rounded-lg bg-indigo-600 px-6 py-2 text-sm font-semibold text-white shadow-sm hover:bg-indigo-700 transition"
                                >
                                    <MessageCircle size={16} />
                                    Message
                                </button>
                            ) : (
                                <button
                                    onClick={() => !isInvited && onInvite()}
                                    disabled={isInvited || invitePending}
                                    className={cn(
                                        "flex items-center gap-2 rounded-lg px-6 py-2 text-sm font-semibold transition border",
                                        isInvited
                                            ? "bg-slate-50 text-slate-400 border-slate-200 cursor-not-allowed"
                                            : "bg-white text-slate-700 border-slate-300 hover:bg-slate-50"
                                    )}
                                >
                                    {invitePending ? <Loader2 className="animate-spin" size={16} /> : <UserPlus size={16} />}
                                    {isInvited ? "Pending" : "Connect"}
                                </button>
                            )}
                        </div>
                    </div>

                    {/* Tabs */}
                    <div className="mt-8 flex items-center gap-6 border-b border-slate-200 text-sm font-medium">
                        {["About", "Photos", "Activity"].map(tab => (
                            <button
                                key={tab}
                                onClick={() => setActiveTab(tab)}
                                className={cn(
                                    "pb-3 text-slate-500 hover:text-slate-800 transition relative",
                                    activeTab === tab && "text-indigo-600 font-semibold"
                                )}
                            >
                                {tab}
                                {activeTab === tab && (
                                    <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-indigo-600 rounded-t-full"></div>
                                )}
                            </button>
                        ))}
                    </div>
                </div>

                {/* Scrollable Content */}
                <div className="flex-1 overflow-y-auto px-8 py-6">
                    {activeTab === "About" && (
                        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                            {/* Main Column */}
                            <div className="lg:col-span-2 space-y-8">

                                <div>
                                    {user.bio && <p className="text-slate-700 leading-relaxed mb-4">{user.bio}</p>}
                                    <div className="space-y-1 text-sm text-slate-600">
                                        {user.campus_name && <p className="font-medium text-slate-900">{user.campus_name}</p>}
                                        {user.major && user.major !== "None" && <p>{user.major} Major</p>}
                                        {user.graduation_year && <p>Class of {user.graduation_year}</p>}
                                    </div>
                                </div>

                                {user.passions && user.passions.length > 0 && (
                                    <div>
                                        <h3 className="font-bold text-slate-900 mb-3">Passions</h3>
                                        <div className="flex flex-wrap gap-2">
                                            {user.passions.map(p => (
                                                <span key={p} className="rounded-md bg-slate-100 px-3 py-1.5 text-sm font-medium text-slate-600">
                                                    {p}
                                                </span>
                                            ))}
                                        </div>
                                    </div>
                                )}

                                {user.ten_year_vision && (
                                    <div>
                                        <h3 className="font-bold text-slate-900 mb-2">10-Year Vision</h3>
                                        <p className="text-slate-700 leading-relaxed">
                                            {user.ten_year_vision}
                                        </p>
                                    </div>
                                )}

                                {user.social_links && (Object.values(user.social_links).some(v => !!v)) && (
                                    <div>
                                        <h3 className="font-bold text-slate-900 mb-3">Social Links</h3>
                                        <div className="flex flex-wrap gap-3">
                                            {user.social_links.instagram && (
                                                <a href={`https://instagram.com/${user.social_links.instagram.replace('@', '')}`} target="_blank" rel="noopener noreferrer" className="rounded-lg bg-gradient-to-tr from-yellow-400 via-red-500 to-purple-500 p-2 text-white hover:opacity-90 transition">
                                                    <Instagram size={20} />
                                                </a>
                                            )}
                                            {user.social_links.linkedin && (
                                                <a href={user.social_links.linkedin} target="_blank" rel="noopener noreferrer" className="rounded-lg bg-[#0077b5] p-2 text-white hover:opacity-90 transition">
                                                    <Linkedin size={20} />
                                                </a>
                                            )}
                                            {user.social_links.website && (
                                                <a href={user.social_links.website} target="_blank" rel="noopener noreferrer" className="rounded-lg bg-slate-200 p-2 text-slate-600 hover:bg-slate-300 transition">
                                                    <Globe size={20} />
                                                </a>
                                            )}
                                            {/* Add other social links as needed */}
                                        </div>
                                    </div>
                                )}

                            </div>

                            {/* Sidebar */}
                            <div className="space-y-6">
                                {/* Social Score */}
                                <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
                                    <h4 className="font-semibold text-slate-900 mb-4">Social Score</h4>
                                    <div className="flex items-center gap-3">
                                        <div className="flex h-12 w-12 items-center justify-center rounded-full bg-indigo-600 text-xl font-bold text-white shadow-lg shadow-indigo-200">
                                            {summary ? level : '-'}
                                        </div>
                                        <div className="flex-1">
                                            <div className="flex justify-between text-xs font-medium mb-1">
                                                <span className="text-indigo-600">Level {summary ? level : '-'}</span>
                                                <span className="text-slate-400">{summary ? Math.floor(score) : 0}/1000</span>
                                            </div>
                                            <div className="h-2 w-full rounded-full bg-slate-100 overflow-hidden">
                                                <div
                                                    className="h-full rounded-full bg-gradient-to-r from-indigo-500 to-purple-500 transition-all duration-1000"
                                                    style={{ width: `${summary ? scoreProgress : 0}%` }}
                                                ></div>
                                            </div>
                                        </div>
                                    </div>
                                </div>

                                {/* Mutual Friends */}
                                <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
                                    <h4 className="font-semibold text-slate-900 mb-4">Mutual Friends</h4>
                                    {loadingExtras && mutuals.length === 0 ? (
                                        <div className="flex justify-center py-4"><Loader2 className="animate-spin text-slate-300" /></div>
                                    ) : (
                                        <>
                                            <div className="flex -space-x-2 pl-1 mb-3">
                                                {mutuals.length > 0 ? mutuals.slice(0, 4).map(m => (
                                                    <div key={m.user_id} className="relative h-8 w-8 rounded-full ring-2 ring-white bg-slate-200 flex items-center justify-center text-xs overflow-hidden" title={m.display_name}>
                                                        {m.avatar_url ? (
                                                            <img src={m.avatar_url} alt={m.display_name} className="h-full w-full object-cover" />
                                                        ) : (
                                                            <span className="font-bold text-slate-500">{m.display_name[0]}</span>
                                                        )}
                                                    </div>
                                                )) : (
                                                    <p className="text-xs text-slate-400 italic">No mutual friends found.</p>
                                                )}
                                            </div>
                                            {mutuals.length > 0 && (
                                                <p className="text-xs text-slate-500">
                                                    You and {user.display_name.split(' ')[0]} have {mutuals.length} friends in common.
                                                </p>
                                            )}
                                        </>
                                    )}
                                </div>

                                {/* Recent Activity (Meetups) */}
                                <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
                                    <h4 className="font-semibold text-slate-900 mb-4">Recent Activity</h4>
                                    {loadingExtras && meetups.length === 0 ? (
                                        <div className="flex justify-center py-4"><Loader2 className="animate-spin text-slate-300" /></div>
                                    ) : meetups.length > 0 ? (
                                        <div className="grid grid-cols-3 gap-2">
                                            {meetups.slice(0, 6).map(m => (
                                                <div key={m.id} className="aspect-square rounded-lg bg-slate-100 overflow-hidden relative group cursor-pointer" title={m.title}>
                                                    <img src={getCategoryImage(m.category)} className="h-full w-full object-cover group-hover:scale-110 transition duration-500" alt={m.title} />
                                                    <div className="absolute inset-0 bg-black/40 flex items-end p-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                                        <span className="text-[8px] leading-tight text-white font-medium line-clamp-2">{m.title}</span>
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    ) : (
                                        <p className="text-xs text-slate-400 italic">No recent activity.</p>
                                    )}
                                </div>

                            </div>
                        </div>
                    )}

                    {activeTab === "Photos" && (
                        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                            {(user.gallery || []).map(img => (
                                <div key={img.key} className="aspect-square rounded-lg bg-slate-100 overflow-hidden">
                                    <Image src={img.url} alt="Gallery" width={300} height={300} className="object-cover h-full w-full" />
                                </div>
                            ))}
                            {(!user.gallery || user.gallery.length === 0) && (
                                <div className="col-span-full py-12 text-center text-slate-400">No photos to display.</div>
                            )}
                        </div>
                    )}

                    {activeTab === "Activity" && (
                        <div className="space-y-4">
                            {meetups.length > 0 ? meetups.map(m => (
                                <div key={m.id} className="flex items-center gap-4 p-4 rounded-xl border border-slate-100 bg-slate-50/50">
                                    <div className="h-12 w-12 rounded-lg bg-indigo-100 shrink-0 overflow-hidden">
                                        <img src={getCategoryImage(m.category)} className="h-full w-full object-cover" />
                                    </div>
                                    <div>
                                        <h4 className="font-semibold text-slate-900">{m.title}</h4>
                                        <p className="text-sm text-slate-500">{new Date(m.start_at).toLocaleDateString()} • {m.location || 'Likely on campus'}</p>
                                    </div>
                                    <div className="ml-auto">
                                        <span className="text-xs font-medium px-2 py-1 rounded bg-white border border-slate-200 text-slate-600 uppercase tracking-widest">{m.status}</span>
                                    </div>
                                </div>
                            )) : (
                                <div className="py-12 text-center text-slate-400">
                                    <p>No recent activity to display.</p>
                                </div>
                            )}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
