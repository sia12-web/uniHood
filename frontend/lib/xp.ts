export const LEVEL_THRESHOLDS: Record<number, number> = {
    1: 0,
    2: 100,
    3: 500,
    4: 1500,
    5: 5000,
    6: 15000,
};

export const LEVEL_LABELS: Record<number, string> = {
    1: "Newcomer",
    2: "Explorer",
    3: "Connector",
    4: "Verified Resident",
    5: "Social Leader",
    6: "Campus Icon",
};

export const LEVEL_CONFIG: Record<number, {
    maxDailyInvites: number;
    maxMeetupCapacity: number;
    maxSimultaneousMeetups: number;
    maxJoinedMeetups: number;
    maxDailyCreate: number;
    maxDailyJoin: number;
}> = {
    1: { maxDailyInvites: 5, maxMeetupCapacity: 5, maxSimultaneousMeetups: 1, maxJoinedMeetups: 5, maxDailyCreate: 3, maxDailyJoin: 3 },
    2: { maxDailyInvites: 10, maxMeetupCapacity: 10, maxSimultaneousMeetups: 1, maxJoinedMeetups: 10, maxDailyCreate: 5, maxDailyJoin: 5 },
    3: { maxDailyInvites: 20, maxMeetupCapacity: 25, maxSimultaneousMeetups: 2, maxJoinedMeetups: 20, maxDailyCreate: 10, maxDailyJoin: 8 },
    4: { maxDailyInvites: 50, maxMeetupCapacity: 50, maxSimultaneousMeetups: 5, maxJoinedMeetups: 50, maxDailyCreate: 20, maxDailyJoin: 12 },
    5: { maxDailyInvites: 100, maxMeetupCapacity: 100, maxSimultaneousMeetups: 10, maxJoinedMeetups: 100, maxDailyCreate: 50, maxDailyJoin: 15 },
    6: { maxDailyInvites: 500, maxMeetupCapacity: 999, maxSimultaneousMeetups: 50, maxJoinedMeetups: 500, maxDailyCreate: 200, maxDailyJoin: 20 },
};

export type LevelUnlock = {
    title: string;
    description: string;
    icon: string;
    category: "discovery" | "safety" | "perks" | "hosting";
};

export type LevelDetail = {
    level: number;
    label: string;
    threshold: number;
    summary: string;
    unlocks: LevelUnlock[];
    color: string;
};

export const LEVEL_DETAILS: Record<number, LevelDetail> = {
    1: {
        level: 1,
        label: "Newcomer",
        threshold: 0,
        summary: "Starting your campus journey.",
        color: "slate",
        unlocks: [
            { title: "Campus Discovery", description: "See students at your university.", icon: "🎓", category: "discovery" },
            { title: "Social Quota", description: "Send up to 5 friend requests daily.", icon: "💌", category: "perks" },
            { title: "Basic Meetups", description: "Host meetups for up to 5 people.", icon: "👥", category: "hosting" },
            { title: "Personal Inbox", description: "Receive messages and invites.", icon: "📩", category: "perks" }
        ]
    },
    2: {
        level: 2,
        label: "Explorer",
        threshold: 100,
        summary: "Branching out beyond your campus.",
        color: "sky",
        unlocks: [
            { title: "City Mode", description: "Discover students from any local university.", icon: "🏙️", category: "discovery" },
            { title: "Quota Boost", description: "Send up to 10 friend requests daily.", icon: "📮", category: "perks" },
            { title: "Capacity Boost", description: "Host meetups for up to 10 people.", icon: "📈", category: "hosting" },
            { title: "Vibe Sync", description: "See shared passions on profiles.", icon: "✨", category: "perks" }
        ]
    },
    3: {
        level: 3,
        label: "Connector",
        threshold: 500,
        summary: "Becoming a known figure in the community.",
        color: "violet",
        unlocks: [
            { title: "Multi-Meetup", description: "Host up to 2 meetups simultaneously.", icon: "📅", category: "hosting" },
            { title: "Quota Boost", description: "Send up to 20 friend requests daily.", icon: "📬", category: "perks" },
            { title: "Crowd Hosting", description: "Host meetups for up to 25 people.", icon: "🎭", category: "hosting" },
            { title: "Smart Suggestions", description: "Priority placement in discovery.", icon: "⚡", category: "perks" }
        ]
    },
    4: {
        level: 4,
        label: "Verified Resident",
        threshold: 1500,
        summary: "Trusted and integrated resident.",
        color: "indigo",
        unlocks: [
            { title: "Room Mode", description: "Live 100m proximity discovery.", icon: "🏠", category: "discovery" },
            { title: "Quota Elite", description: "Send up to 50 friend requests daily.", icon: "💎", category: "perks" },
            { title: "Social Aura", description: "Exclusive glow on your profile card.", icon: "🌟", category: "perks" },
            { title: "Large Capacity", description: "Host meetups for up to 50 people.", icon: "🏢", category: "hosting" }
        ]
    },
    5: {
        level: 5,
        label: "Social Leader",
        threshold: 5000,
        summary: "A pillar of campus social life.",
        color: "emerald",
        unlocks: [
            { title: "Visibility+ ", description: "25% permanent boost in all feeds.", icon: "🚀", category: "perks" },
            { title: "Social Legend Quota", description: "Send up to 100 friend requests daily.", icon: "🔥", category: "perks" },
            { title: "Massive Events", description: "Host meetups for up to 100 people.", icon: "🎪", category: "hosting" },
            { title: "Priority Support", description: "Direct line to community safety.", icon: "🛡️", category: "safety" }
        ]
    },
    6: {
        level: 6,
        label: "Campus Icon",
        threshold: 15000,
        summary: "The ultimate tier of campus influence.",
        color: "amber",
        unlocks: [
            { title: "Global Border", description: "Exclusive golden profile frame.", icon: "👑", category: "perks" },
            { title: "Unlimited Network", description: "Virtually unlimited daily social invites.", icon: "🌐", category: "perks" },
            { title: "Unlimited Hosting", description: "No attendee limits on your meetups.", icon: "♾️", category: "hosting" },
            { title: "Nominate Mode", description: "Boost other students in the feed.", icon: "🔥", category: "perks" }
        ]
    }
};

export function getLevelProgress(xp: number, level: number, nextLevelXp?: number | null): number {
    if (nextLevelXp === null || nextLevelXp === undefined) return 100;
    const currentBase = LEVEL_THRESHOLDS[level] || 0;
    const needed = nextLevelXp - currentBase;
    if (needed <= 0) return 100;
    const earned = xp - currentBase;
    return Math.min(100, Math.max(0, (earned / needed) * 100));
}

import { readAuthSnapshot } from "./auth-storage";

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

export type DailyChecklist = {
    daily_login: boolean;
    game_played: boolean;
    chat_sent: boolean;
    discovery_swipe: boolean;
};

export async function fetchDailyChecklist(): Promise<DailyChecklist> {
    const auth = readAuthSnapshot();
    if (!auth?.token) {
        throw new Error("unauthorized");
    }

    const res = await fetch(`${API_BASE}/xp/daily-checklist`, {
        headers: {
            "Authorization": `Bearer ${auth.token}`,
            "Content-Type": "application/json",
        },
    });

    if (!res.ok) {
        throw new Error("Failed to fetch daily checklist");
    }

    return res.json();
}
