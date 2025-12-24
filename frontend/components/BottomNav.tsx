"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Compass, MessageCircle, Users, Trophy, User, Gamepad2 } from "lucide-react";
import { useMemo } from "react";

function isActive(pathname: string, href: string) {
    if (href === "/") return pathname === "/";
    // Strict match for discovery to avoid highlighting on sub-routes if desired, 
    // but usually prefix matching is better for sections.
    // For UniHood, /discovery is the feed.
    return pathname === href || pathname.startsWith(`${href}/`);
}

export default function BottomNav() {
    const pathname = usePathname() ?? "/";

    // Navigation Items
    const navItems = useMemo(() => [
        { label: "Socials", href: "/socials", icon: Compass },
        { label: "Chat", href: "/chat", icon: MessageCircle },
        { label: "Games", href: "/games", icon: Gamepad2 },
        { label: "Meetups", href: "/meetups", icon: Users },
        { label: "Rank", href: "/leaderboards", icon: Trophy },
        { label: "Profile", href: "/settings/profile", icon: User },
    ], []);

    // Don't show on non-authenticated routes (handled by AppChrome usually, but good to be safe)
    // Actually AppChrome conditionally renders this whole component likely.

    return (
        <nav className="fixed bottom-0 left-0 z-50 w-full border-t border-slate-200 bg-white/90 pb-safe backdrop-blur-lg md:hidden">
            <div className="grid h-16 grid-cols-6 items-center justify-items-center">
                {navItems.map(({ label, href, icon: Icon }) => {
                    const active = isActive(pathname, href);
                    return (
                        <Link
                            key={href}
                            href={href}
                            className={`flex h-full w-full flex-col items-center justify-center gap-0.5 transition-colors active:scale-95 ${active ? "text-rose-600" : "text-slate-400 hover:text-slate-600"
                                }`}
                        >
                            <Icon
                                size={24}
                                className={`transition-all ${active ? "fill-current" : ""}`}
                                strokeWidth={active ? 2.5 : 2}
                            />
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
