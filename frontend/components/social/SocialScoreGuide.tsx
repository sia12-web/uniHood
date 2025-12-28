"use client";
import { Trophy, Users, MessageCircle, Calendar, Star, Info, Gamepad2, ShieldCheck, Globe, Building2, Lock, Mail, Smartphone, Camera, Sparkles, UserPlus } from "lucide-react";
import { cn } from "@/lib/utils";
import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";

export function SocialScoreGuideContent() {
    const [activeTab, setActiveTab] = useState<"earn" | "levels" | "meetups" | "safety">("earn");

    const tabs = [
        { id: "earn", label: "Earning XP", icon: Star },
        { id: "levels", label: "Hierarchy", icon: Trophy },
        { id: "meetups", label: "Meetups", icon: Calendar },
        { id: "safety", label: "Safety", icon: ShieldCheck },
    ] as const;

    return (
        <div className="flex w-full flex-col overflow-hidden bg-white dark:bg-slate-900 rounded-[32px] shadow-xl border border-slate-200/50 dark:border-slate-800/50">
            {/* Header */}
            <div className="flex items-center justify-between border-b px-8 py-8 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/50">
                <div className="flex items-center gap-4">
                    <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-indigo-600 text-white shadow-lg shadow-indigo-200">
                        <Trophy className="h-7 w-7" />
                    </div>
                    <div>
                        <h2 className="text-3xl font-black text-slate-900 dark:text-white tracking-tight">Social Explorer Guide</h2>
                        <p className="text-sm font-bold text-indigo-500 uppercase tracking-widest">Master the Campus Reputation System</p>
                    </div>
                </div>
            </div>

            {/* Tabs Navigation */}
            <div className="flex gap-2 px-8 py-6 border-b dark:border-slate-800 overflow-x-auto hide-scrollbar bg-white dark:bg-slate-900">
                {tabs.map((tab) => (
                    <button
                        key={tab.id}
                        onClick={() => setActiveTab(tab.id)}
                        className={cn(
                            "flex items-center gap-2 px-8 py-3 rounded-2xl font-bold text-sm transition-all whitespace-nowrap",
                            activeTab === tab.id
                                ? "bg-indigo-600 text-white shadow-xl shadow-indigo-200 scale-105"
                                : "text-slate-500 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800"
                        )}
                    >
                        <tab.icon size={18} />
                        {tab.label}
                    </button>
                ))}
            </div>

            {/* Content Area */}
            <div className="flex-1 overflow-y-auto scroll-smooth px-8 py-10 bg-white dark:bg-slate-950">
                <AnimatePresence mode="wait">
                    <motion.div
                        key={activeTab}
                        initial={{ opacity: 0, y: 15 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -15 }}
                        transition={{ duration: 0.3, ease: "easeOut" }}
                    >
                        {activeTab === "earn" && (
                            <div className="space-y-12">
                                <div className="max-w-3xl">
                                    <h3 className="text-4xl font-black text-slate-900 dark:text-white mb-6">Unleash Your Potential</h3>
                                    <p className="text-xl text-slate-600 dark:text-slate-300 leading-relaxed font-medium">
                                        Campus XP is more than just points—it's your social currency. Your engagement directly impacts your visibility and the exclusive features you can access.
                                    </p>
                                </div>

                                <div className="grid gap-10 lg:grid-cols-3">
                                    <div className="lg:col-span-2 space-y-6">
                                        <div className="overflow-hidden rounded-[32px] border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-950 shadow-sm">
                                            <table className="w-full text-left">
                                                <thead className="bg-slate-50 text-slate-400 dark:bg-slate-900 dark:text-slate-500">
                                                    <tr>
                                                        <th className="px-8 py-5 font-bold uppercase tracking-widest text-[11px]">Action</th>
                                                        <th className="px-8 py-5 font-bold uppercase tracking-widest text-[11px] text-right">XP Reward</th>
                                                    </tr>
                                                </thead>
                                                <tbody className="divide-y divide-slate-100 dark:divide-slate-800/50">
                                                    <GuideRow icon={<Calendar className="text-purple-500" />} label="Host a Meetup" points="+100 XP" />
                                                    <GuideRow icon={<Users className="text-green-500" />} label="Join a Meetup" points="+50 XP" />
                                                    <GuideRow icon={<Users className="text-blue-500" />} label="New Friendship" points="+50 XP" />
                                                    <GuideRow icon={<Trophy className="text-amber-500" />} label="Win a Game" points="+20 XP" />
                                                    <GuideRow icon={<Gamepad2 className="text-indigo-500" />} label="Play a Game" points="+10 XP" />
                                                    <GuideRow icon={<UserPlus className="text-rose-500" />} label="Send Friend Request" points="+10 XP" />
                                                    <GuideRow icon={<ShieldCheck className="text-emerald-500" />} label="Daily Login" points="+25 XP" />
                                                    <GuideRow icon={<MessageCircle className="text-sky-500" />} label="Send Message" points="+2 XP" />
                                                </tbody>
                                            </table>
                                        </div>
                                    </div>

                                    <div className="space-y-8">
                                        <div className="p-8 rounded-[32px] bg-gradient-to-br from-indigo-600 to-indigo-800 text-white shadow-xl">
                                            <h4 className="text-lg font-bold mb-3 flex items-center gap-2">
                                                <Sparkles className="h-5 w-5" /> Efficiency Tip
                                            </h4>
                                            <p className="text-sm text-indigo-100 leading-relaxed mb-6 font-medium">
                                                The fastest way to reach level 4 is consistent hosting. Hosting 3 successful meetups a week can get you verified in less than a month.
                                            </p>
                                            <div className="bg-white/20 rounded-2xl p-4 text-center">
                                                <div className="text-3xl font-black">+150 XP/week</div>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        )}

                        {activeTab === "levels" && (
                            <div className="space-y-10">
                                <div className="max-w-3xl">
                                    <h3 className="text-4xl font-black text-slate-900 dark:text-white mb-6">The Path to Influence</h3>
                                    <p className="text-xl text-slate-600 dark:text-slate-300 leading-relaxed font-medium">
                                        Each level represents a milestone in your campus journey.
                                    </p>
                                </div>

                                <div className="overflow-hidden rounded-[40px] border border-slate-200 dark:border-slate-800 shadow-xl overflow-x-auto">
                                    <table className="w-full text-left border-collapse min-w-[600px]">
                                        <thead className="bg-slate-900 text-white">
                                            <tr>
                                                <th className="px-8 py-6 font-bold uppercase tracking-widest text-[11px]">Rank & Title</th>
                                                <th className="px-8 py-6 font-bold uppercase tracking-widest text-[11px]">XP Threshold</th>
                                                <th className="px-8 py-6 font-bold uppercase tracking-widest text-[11px]">Exclusive Perks</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-slate-100 dark:divide-slate-800 bg-white dark:bg-slate-950">
                                            <LevelRowContent lvl={1} label="Newcomer" xp="0+" perk="Campus Discovery" icon="👤" />
                                            <LevelRowContent lvl={2} label="Explorer" xp="100+" perk="City Mode Unlocked" color="text-sky-500" icon="✨" />
                                            <LevelRowContent lvl={3} label="Connector" xp="500+" perk="Multi-Meetup Hosting" color="text-violet-500" icon="⚡" />
                                            <LevelRowContent lvl={4} label="Resident" xp="1,500+" perk="Room Mode + Aura" color="text-indigo-600" icon="⭐" highlight />
                                            <LevelRowContent lvl={5} label="Leader" xp="5,000+" perk="+25% Visibility" color="text-slate-900" icon="🏅" />
                                            <LevelRowContent lvl={6} label="Icon" xp="15,000+" perk="Global Search" color="text-amber-500" icon="👑" />
                                        </tbody>
                                    </table>
                                </div>
                            </div>
                        )}

                        {activeTab === "meetups" && (
                            <div className="space-y-12">
                                <div className="grid gap-8 md:grid-cols-3">
                                    <ModeScopeCard icon={<Users size={28} className="text-indigo-500" />} label="Friends" level="Lvl 1+" desc="Only visible to mutually connected students." />
                                    <ModeScopeCard icon={<Building2 size={28} className="text-blue-500" />} label="Campus" level="Lvl 1+" desc="Your university community." />
                                    <ModeScopeCard icon={<Globe size={28} className="text-emerald-500" />} label="City" level="Lvl 2+" desc="Broad local discovery." />
                                </div>
                            </div>
                        )}

                        {activeTab === "safety" && (
                            <div className="space-y-12">
                                <div className="grid gap-10 md:grid-cols-2 items-start">
                                    <div className="p-10 rounded-[48px] bg-slate-950 text-white shadow-2xl relative overflow-hidden group">
                                        <div className="relative z-10">
                                            <Lock className="text-indigo-500 mb-6" size={32} />
                                            <h4 className="text-3xl font-black mb-6">The Level 4 Gate</h4>
                                            <p className="text-slate-400 font-medium leading-relaxed">Room Mode (100m Live) is only for those who have reached Level 4 and completed Elite Verification.</p>
                                        </div>
                                    </div>
                                    <div className="space-y-6">
                                        <VerificationStep icon={<Mail size={24} className="text-blue-500" />} label="University Credentials" desc="Direct linkage via SSO." />
                                        <VerificationStep icon={<Smartphone size={24} className="text-purple-500" />} label="Phone Binding" desc="Ensures accountability." />
                                        <VerificationStep icon={<Camera size={24} className="text-indigo-500" />} label="Identity Matching" desc="AI face verification." />
                                    </div>
                                </div>
                            </div>
                        )}
                    </motion.div>
                </AnimatePresence>
            </div>
        </div>
    );
}

function GuideRow({ icon, label, points }: { icon: React.ReactNode; label: string; points: string }) {
    return (
        <tr className="group hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors">
            <td className="px-8 py-5 flex items-center gap-5 text-sm font-bold text-slate-700 dark:text-slate-200">
                <span className="scale-125 opacity-70 group-hover:opacity-100 transition-all">{icon}</span>
                {label}
            </td>
            <td className="px-8 py-5 text-right font-black text-indigo-600 dark:text-indigo-400 text-lg">{points}</td>
        </tr>
    );
}

function LevelRowContent({ lvl, label, xp, perk, color = "text-slate-900", icon, highlight = false }: { lvl: number; label: string; xp: string; perk: string; color?: string; icon: string; highlight?: boolean }) {
    return (
        <tr className={cn("group transition-all", highlight ? "bg-indigo-50/50 dark:bg-indigo-900/10" : "hover:bg-slate-50 dark:hover:bg-slate-900/50")}>
            <td className="px-8 py-6">
                <div className="flex items-center gap-4">
                    <span className="text-3xl transition-transform group-hover:scale-110">{icon}</span>
                    <div className="flex flex-col">
                        <span className={cn("text-lg font-black tracking-tight leading-none", color)}>{label}</span>
                        <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest mt-1.5">LEVEL {lvl}</span>
                    </div>
                </div>
            </td>
            <td className="px-8 py-6 text-sm font-black text-slate-500">{xp}</td>
            <td className="px-8 py-6">
                <span className={cn("inline-block px-4 py-1.5 rounded-xl text-[11px] font-bold tracking-tight shadow-sm border", highlight ? "bg-indigo-600 text-white border-indigo-500" : "bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-300")}>{perk}</span>
            </td>
        </tr>
    );
}

function ModeScopeCard({ icon, label, level, desc }: { icon: React.ReactNode; label: string; level: string; desc: string }) {
    return (
        <div className="p-8 rounded-[40px] border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 shadow-sm hover:shadow-xl transition-all">
            <div className="flex items-start justify-between mb-6">
                <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-900 border border-slate-100 dark:border-slate-800">{icon}</div>
                <span className="px-3 py-1.5 rounded-xl bg-indigo-600 text-white text-[10px] font-black uppercase tracking-widest">{level}</span>
            </div>
            <h4 className="text-2xl font-black text-slate-900 dark:text-white mb-3">{label} Mode</h4>
            <p className="text-sm text-slate-500 dark:text-slate-400 leading-relaxed font-medium">{desc}</p>
        </div>
    );
}

function VerificationStep({ icon, label, desc }: { icon: React.ReactNode; label: string; desc: string }) {
    return (
        <div className="flex items-center gap-5 p-5 rounded-3xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 hover:border-indigo-400 transition-all">
            <div className="shrink-0 p-4 rounded-2xl bg-slate-50 dark:bg-slate-800">{icon}</div>
            <div>
                <div className="text-base font-black text-slate-900 dark:text-white leading-none mb-1">{label}</div>
                <div className="text-xs font-medium text-slate-500">{desc}</div>
            </div>
        </div>
    );
}
