"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Compass, MessageCircle, Users, Trophy, User, Gamepad2 } from "lucide-react";
import { useMemo } from "react";
import { useMeetupNotifications } from "@/hooks/use-meetup-notifications";

function isActive(pathname: string, href: string) {
    if (href === "/") return pathname === "/";
    // Strict match for discovery to avoid highlighting on sub-routes if desired, 
    // but usually prefix matching is better for sections.
    // For UniHood, /socials is the hub.
    return pathname === href || pathname.startsWith(`${href}/`);
}

export default function BottomNav() {
    const pathname = usePathname() ?? "/";
    const { hasNewMeetups, markAsSeen } = useMeetupNotifications();

    // Navigation Items
    const navItems = useMemo(() => [
        { label: "Socials", href: "/socials", icon: Compass },
        { label: "Chat", href: "/chat", icon: MessageCircle },
        { label: "Games", href: "/games", icon: Gamepad2 },
        { label: "Meetups", href: "/meetups", icon: Users, hasNotification: hasNewMeetups },
        { label: "Rank", href: "/leaderboards", icon: Trophy },
        { label: "Profile", href: "/settings/profile", icon: User },
    ], [hasNewMeetups]);

    const handleMeetupClick = () => {
        if (hasNewMeetups) {
            markAsSeen();
        }
    };

    // Don't show on non-authenticated routes (handled by AppChrome usually, but good to be safe)
    // Actually AppChrome conditionally renders this whole component likely.

    return (
        <nav className="fixed bottom-0 left-0 z-50 w-full border-t border-slate-200 bg-white/90 pb-safe backdrop-blur-lg md:hidden">
            <div className="grid h-16 grid-cols-6 items-center justify-items-center">
                {navItems.map(({ label, href, icon: Icon, hasNotification }) => {
                    const active = isActive(pathname, href);
                    const isMeetups = label === "Meetups";
                    return (
                        <Link
                            key={href}
                            href={href}
                            onClick={isMeetups ? handleMeetupClick : undefined}
                            className={`flex h-full w-full flex-col items-center justify-center gap-0.5 transition-colors active:scale-95 ${active ? "text-rose-600" : "text-slate-400 hover:text-slate-600"
                                }`}
                        >
                            <div className="relative">
                                <Icon
                                    size={24}
                                    className={`transition-all ${active ? "fill-current" : ""}`}
                                    strokeWidth={active ? 2.5 : 2}
                                />
                                {hasNotification && (
                                    <span className="absolute -top-1 -right-1 h-2.5 w-2.5 rounded-full bg-blue-500 ring-2 ring-white" />
                                )}
                            </div>
                            <span className="text-[10px] font-medium tracking-tight">
                                {label}
                            </span>
                        </Link>
                    );
                })}
            </div>
        </nav>
    );
}
