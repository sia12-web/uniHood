"use client";

import { useMemo } from "react";
import { CheckCircle2, Circle, Trophy, ArrowRight } from "lucide-react";
import type { ProfileRecord } from "@/lib/types";
import { cn } from "@/lib/utils";

type ProfileCompletionProps = {
    profile: ProfileRecord;
    activeTab?: string;
    onNavigate?: (tab: string) => void;
};

type CompletionItem = {
    id: string;
    label: string;
    description: string;
    isComplete: boolean;
    tab: string;
};

export default function ProfileCompletion({ profile, onNavigate }: ProfileCompletionProps) {
    const items = useMemo((): CompletionItem[] => {
        return [
            {
                id: "avatar",
                label: "Profile Photo",
                description: "Add a clear photo of yourself.",
                isComplete: !!profile.avatar_url,
                tab: "profile",
            },
            {
                id: "bio",
                label: "Bio",
                description: "Tell campus a bit about yourself.",
                isComplete: (profile.bio?.length ?? 0) >= 10,
                tab: "profile",
            },
            {
                id: "details",
                label: "Major & Graduation",
                description: "Help classmates find you.",
                isComplete: !!(profile.major && profile.graduation_year),
                tab: "profile",
            },
            {
                id: "passions",
                label: "Passions",
                description: "Add at least 3 things you love.",
                isComplete: (profile.passions?.length ?? 0) >= 3,
                tab: "profile",
            },
            {
                id: "gallery",
                label: "Photo Gallery",
                description: "Show more of your personality.",
                isComplete: (profile.gallery?.length ?? 0) >= 1,
                tab: "profile",
            },
            {
                id: "vibe_details",
                label: "Discovery Details",
                description: "Relationship status & orientation.",
                isComplete: !!(profile.relationship_status && profile.sexual_orientation),
                tab: "profile",
            },
            {
                id: "lifestyle",
                label: "Lifestyle Info",
                description: "Drinking, smoking, workout habits.",
                isComplete: !!(profile.lifestyle?.drinking && profile.lifestyle?.smoking && profile.lifestyle?.workout),
                tab: "profile",
            },
            {
                id: "prompts",
                label: "Discovery Vibe",
                description: "Answer 3 fun prompts.",
                isComplete: (profile.profile_prompts?.length ?? 0) >= 3,
                tab: "profile",
            }
        ];
    }, [profile]);

    const completeCount = items.filter(i => i.isComplete).length;
    const totalCount = items.length;
    const percentage = Math.round((completeCount / totalCount) * 100);

    const nextItem = items.find(i => !i.isComplete);

    return (
        <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-sm">
            <div className="p-6 md:p-8 bg-gradient-to-br from-indigo-50 to-white border-b border-slate-100">
                <div className="flex items-center justify-between mb-6">
                    <div>
                        <h3 className="text-lg font-bold text-slate-900 flex items-center gap-2">
                            <Trophy className="text-indigo-600" size={20} />
                            Profile Maturity
                        </h3>
                        <p className="text-sm text-slate-500 mt-1 font-medium">
                            Complete your profile to boost your Social Score.
                        </p>
                    </div>
                    <div className="text-right">
                        <span className="text-3xl font-black text-indigo-600 leading-none">{percentage}%</span>
                        <div className="text-[10px] font-black uppercase tracking-widest text-slate-400 mt-1">Complete</div>
                    </div>
                </div>

                {/* Progress Bar */}
                <div className="h-3 w-full bg-slate-100 rounded-full overflow-hidden shadow-inner flex">
                    <div
                        className="h-full bg-indigo-600 transition-all duration-700 ease-out shadow-[0_0_10px_rgba(79,70,229,0.3)]"
                        style={{ width: `${percentage}%` }}
                    />
                </div>
            </div>

            <div className="p-4 md:p-6 space-y-3 bg-white">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    {items.map((item) => (
                        <div
                            key={item.id}
                            className={cn(
                                "flex items-center gap-3 p-3 rounded-xl border transition-all cursor-default",
                                item.isComplete
                                    ? "bg-slate-50 border-slate-100 text-slate-500"
                                    : "bg-white border-slate-200 hover:border-indigo-300 shadow-sm"
                            )}
                        >
                            <div className="shrink-0">
                                {item.isComplete ? (
                                    <CheckCircle2 className="text-emerald-500" size={20} />
                                ) : (
                                    <Circle className="text-slate-300" size={20} />
                                )}
                            </div>
                            <div className="min-w-0">
                                <div className={cn("text-sm font-bold truncate", item.isComplete ? "text-slate-500" : "text-slate-900")}>
                                    {item.label}
                                </div>
                                {!item.isComplete && (
                                    <p className="text-[11px] text-slate-500 font-medium truncate">{item.description}</p>
                                )}
                            </div>
                        </div>
                    ))}
                </div>

                {percentage < 100 && nextItem && (
                    <div className="pt-4 mt-2">
                        <button
                            onClick={() => onNavigate?.(nextItem.tab)}
                            className="w-full flex items-center justify-between p-4 rounded-xl bg-indigo-600 text-white font-bold text-sm shadow-lg shadow-indigo-100 hover:bg-indigo-700 transition-all hover:translate-y-[-1px]"
                        >
                            <span>Up Next: {nextItem.label}</span>
                            <ArrowRight size={18} />
                        </button>
                    </div>
                )}
            </div>
        </div>
    );
}
