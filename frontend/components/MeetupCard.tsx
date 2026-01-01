import Image from "next/image";
import {
    Calendar, MapPin, Users, BookOpen,
    Dumbbell, Utensils, Gamepad2, Globe, Building2
} from "lucide-react";
import { MeetupCategory, MeetupResponse } from "@/lib/meetups";
import { cn } from "@/lib/utils";

// Category definitions with styling matching the design
export const MEETUP_CATEGORIES = [
    { label: "Study", value: "study" as MeetupCategory, icon: BookOpen, color: "text-purple-600", bg: "bg-purple-100", badgeBg: "bg-purple-100", badgeText: "text-purple-700" },
    { label: "Gym", value: "gym" as MeetupCategory, icon: Dumbbell, color: "text-slate-600", bg: "bg-white", badgeBg: "bg-slate-100", badgeText: "text-slate-700" },
    { label: "Food", value: "food" as MeetupCategory, icon: Utensils, color: "text-orange-600", bg: "bg-white", badgeBg: "bg-orange-100", badgeText: "text-orange-700" },
    { label: "Game", value: "game" as MeetupCategory, icon: Gamepad2, color: "text-indigo-600", bg: "bg-white", badgeBg: "bg-indigo-100", badgeText: "text-indigo-700" },
];

interface MeetupCardProps {
    meetup: MeetupResponse;
    onJoin: (id: string) => void;
}

export function MeetupCard({ meetup, onJoin }: MeetupCardProps) {
    const category = MEETUP_CATEGORIES.find((c) => c.value === meetup.category) || {
        label: "Other", value: "other", icon: Users, color: "text-slate-600", bg: "bg-white", badgeBg: "bg-slate-100", badgeText: "text-slate-700"
    };
    const CategoryIcon = category.icon;

    const startDate = new Date(meetup.start_at);
    const dateStr = startDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });

    // Use real location
    const location = meetup.location || "Location TBD";

    const percentFull = Math.min(100, Math.max(0, (meetup.participants_count / meetup.capacity) * 100));

    return (
        <div className="group flex flex-col rounded-[32px] bg-white dark:bg-slate-900 p-6 shadow-sm transition-all hover:shadow-xl border border-slate-100/50 dark:border-slate-800">
            {/* Header Badge */}
            <div className="flex items-start justify-between">
                <span className={cn("flex items-center gap-2 rounded-full px-4 py-1.5 text-xs font-bold uppercase tracking-wide", category.badgeBg, category.badgeText)}>
                    <CategoryIcon className="h-4 w-4" />
                    {category.label}
                </span>

                <span className={cn(
                    "flex items-center gap-1.5 rounded-full px-3 py-1 text-[10px] font-bold uppercase tracking-wider",
                    meetup.visibility === "CITY" ? "bg-emerald-100 text-emerald-700" :
                        meetup.visibility === "CAMPUS" ? "bg-blue-100 text-blue-700" : "bg-slate-100 text-slate-700"
                )}>
                    {meetup.visibility === "CITY" ? <Globe size={10} /> : meetup.visibility === "CAMPUS" ? <Building2 size={10} /> : <Users size={10} />}
                    {meetup.visibility?.toLowerCase()}
                </span>
            </div>

            {/* Title & Info */}
            <div className="mt-5 space-y-4">
                <h3 className="text-xl font-bold text-slate-900 dark:text-slate-100 group-hover:text-purple-600 dark:group-hover:text-purple-400 transition-colors line-clamp-1">
                    {meetup.title}
                </h3>

                <div className="space-y-2 text-sm text-slate-500 dark:text-slate-400 font-medium">
                    <div className="flex items-center gap-3">
                        <Calendar className="h-4 w-4 shrink-0 text-slate-400" />
                        <span>{dateStr}</span>
                    </div>
                    <div className="flex items-center gap-3">
                        <MapPin className="h-4 w-4 shrink-0 text-slate-400" />
                        <span className="line-clamp-1">{location}</span>
                    </div>
                </div>

                {/* Host Info */}
                <div className="flex items-center gap-3 pt-1">
                    <div className="relative h-8 w-8 overflow-hidden rounded-full bg-slate-200 ring-2 ring-white dark:ring-slate-800">
                        {meetup.creator_avatar_url ? (
                            <Image src={meetup.creator_avatar_url} alt="Host" fill className="object-cover" />
                        ) : (
                            <div className="flex h-full w-full items-center justify-center bg-slate-300 text-xs font-bold text-slate-500">
                                {meetup.creator_name?.[0]?.toUpperCase() || "H"}
                            </div>
                        )}
                    </div>
                    <span className="text-sm text-slate-600 dark:text-slate-400 font-medium">
                        Hosted by: <span className="text-slate-900 dark:text-slate-200 font-semibold">{meetup.creator_name || "Community Member"}</span>
                    </span>
                </div>
            </div>

            {/* Participants Progress */}
            <div className="mt-6 mb-6">
                <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">Participants</span>
                <div className="mt-2 h-2 w-full rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden">
                    <div
                        className="h-full rounded-full bg-indigo-500 transition-all duration-500"
                        style={{ width: `${percentFull}%` }}
                    />
                </div>
                <div className="mt-2.5 flex items-center justify-between">
                    <span className="text-sm font-semibold text-slate-700 dark:text-slate-300">{meetup.participants_count}/{meetup.capacity} joined</span>
                    <div className="flex -space-x-2">
                        {meetup.recent_participants_avatars?.map((avatar, i) => (
                            <div key={i} className="relative h-6 w-6 overflow-hidden rounded-full border-2 border-white dark:border-slate-800 bg-slate-200">
                                {avatar && <Image src={avatar} alt="Participant" fill className="object-cover" />}
                            </div>
                        ))}
                        {/* Fallback empty circles if no avatars but count > 0 */}
                        {(meetup.participants_count > (meetup.recent_participants_avatars?.length || 0)) && (
                            <div className="flex h-6 w-6 items-center justify-center rounded-full border-2 border-white dark:border-slate-800 bg-slate-100 dark:bg-slate-700 text-[9px] font-bold text-slate-500">
                                +{meetup.participants_count - (meetup.recent_participants_avatars?.length || 0)}
                            </div>
                        )}
                    </div>
                </div>
            </div>

            {/* Action Button */}
            <div className="mt-auto">
                <button
                    onClick={() => {
                        if (meetup.is_joined) {
                            window.location.href = `/meetups/${meetup.id}`;
                        } else {
                            onJoin(meetup.id);
                        }
                    }}
                    disabled={!meetup.is_joined && meetup.participants_count >= meetup.capacity}
                    className={cn(
                        "w-full rounded-xl py-3 text-sm font-bold text-white shadow-lg transition-all hover:-translate-y-0.5 hover:shadow-xl active:translate-y-0 disabled:cursor-not-allowed disabled:opacity-50 disabled:shadow-none",
                        meetup.is_joined
                            ? "bg-emerald-500 shadow-emerald-200/50 hover:bg-emerald-600"
                            : "bg-[#4f46e5] shadow-sm hover:bg-indigo-700"
                    )}
                >
                    {meetup.is_joined ? "Enter Room" : meetup.participants_count >= meetup.capacity ? "Full" : "Join Group"}
                </button>
            </div>
        </div>
    );
}
