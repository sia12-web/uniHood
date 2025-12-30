"use client";

import { usePathname } from "next/navigation";
import { useMemo } from "react";
import { Check } from "lucide-react";
import { motion } from "framer-motion";

const STEPS = [
    { id: "university", path: "/select-university", label: "University" },
    { id: "major", path: "/major-year", label: "Academics" },
    { id: "courses", path: "/select-courses", label: "Courses" },
    { id: "passions", path: "/passions", label: "Interests" },
    { id: "photos", path: "/photos", label: "Photos" },
    { id: "vibes", path: "/vibes", label: "Vibe" },
    { id: "vision", path: "/vision", label: "Vision" },
    // Welcome and Verify are outside the main flow or at the end
];

export function OnboardingStepIndicator() {
    const pathname = usePathname();

    const currentStepIndex = useMemo(() => {
        return STEPS.findIndex((s) => pathname?.startsWith(s.path));
    }, [pathname]);

    // If we are on a page not in the list (e.g. welcome), showing nothing or full might be better. 
    // Let's assume full if unknown/past flow, or 0 if start.
    // Actually, for robustness, if index is -1, checks if we are on welcome or later.

    const isWelcome = pathname === "/welcome";

    if (currentStepIndex === -1 && !isWelcome) {
        return null;
    }

    const total = STEPS.length;
    const progress = isWelcome ? total : Math.max(0, currentStepIndex + 1);
    const percentage = isWelcome ? 100 : Math.round((progress / total) * 100);

    return (
        <div className="w-full max-w-xl mx-auto mb-8 px-4">
            <div className="flex items-center justify-between text-xs font-bold uppercase tracking-wider text-slate-500 mb-2">
                <span>{isWelcome ? "All Steps Completed" : `Step ${progress} of ${total}`}</span>
                <span>{percentage}% Complete</span>
            </div>
            <div className="h-2 w-full bg-slate-200/50 backdrop-blur-sm rounded-full overflow-hidden">
                <motion.div
                    className="h-full bg-gradient-to-r from-indigo-500 to-purple-600 shadow-[0_0_10px_rgba(99,102,241,0.5)]"
                    initial={{ width: 0 }}
                    animate={{ width: `${percentage}%` }}
                    transition={{ duration: 0.5, ease: "easeInOut" }}
                />
            </div>
        </div>
    );
}
