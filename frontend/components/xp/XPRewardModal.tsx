"use client";

import { useEffect, useState } from "react";
import { Zap, Star } from "lucide-react";
import { cn } from "@/lib/utils";

interface XPRewardModalProps {
    amount: number;
    action: string;
    onClose: () => void;
}

const ENCOURAGEMENTS = [
    "Keep it up!",
    "You're on fire!",
    "Awesome work!",
    "Level up is close!",
    "Unstoppable!",
    "Great job!",
    "Way to go!"
];

export function XPRewardModal({ amount, action, onClose }: XPRewardModalProps) {
    const [visible, setVisible] = useState(false);

    useEffect(() => {
        // Trigger enter animation
        requestAnimationFrame(() => setVisible(true));
    }, []);

    const handleClose = () => {
        setVisible(false);
        setTimeout(onClose, 200); // Wait for exit animation
    };

    const isNegative = amount < 0;

    const NEGATIVE_TITLES = [
        "XP Lost",
        "Point Deduction",
        "Setback",
        "Experience Lost"
    ];

    const encouragingText = isNegative
        ? NEGATIVE_TITLES[Math.floor(Math.random() * NEGATIVE_TITLES.length)]
        : ENCOURAGEMENTS[Math.floor(Math.random() * ENCOURAGEMENTS.length)];

    const readableAction = action.replace(/_/g, " ").toLowerCase();

    // Theme colors
    const startColor = isNegative ? "from-red-400/20" : "from-amber-400/20";
    const bgBlur = isNegative ? "bg-red-500" : "bg-amber-400";
    const gradient = isNegative ? "from-red-400 to-red-600" : "from-amber-300 to-amber-500";
    const textColor = isNegative ? "text-red-600 dark:text-red-400" : "text-amber-600 dark:text-amber-400";
    const buttonBg = isNegative ? "bg-red-600 hover:bg-red-700 dark:bg-red-600 dark:hover:bg-red-700 text-white" : "bg-slate-900 dark:bg-white text-white dark:text-slate-900";


    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm transition-opacity duration-300"
            style={{ opacity: visible ? 1 : 0 }}>
            <div
                className={cn(
                    "relative w-full max-w-sm transform overflow-hidden rounded-3xl bg-white dark:bg-slate-900 shadow-2xl transition-all duration-300 scale-90",
                    visible ? "scale-100 opacity-100" : "scale-90 opacity-0"
                )}
            >
                {/* Decorative background glow */}
                <div className={`absolute top-0 inset-x-0 h-32 bg-gradient-to-b ${startColor} to-transparent pointer-events-none`} />

                <div className="relative p-8 flex flex-col items-center text-center">

                    {/* Icon Circle */}
                    <div className="mb-6 relative">
                        <div className={`absolute inset-0 ${bgBlur} rounded-full blur-xl opacity-40 animate-pulse`}></div>
                        <div className={`relative h-20 w-20 bg-gradient-to-br ${gradient} rounded-full flex items-center justify-center shadow-lg ring-4 ring-white dark:ring-slate-800`}>
                            <Zap className="h-10 w-10 text-white fill-white" />
                        </div>
                        {/* Floating stars - hide for negative? or keep distinct */}
                        {!isNegative && (
                            <>
                                <Star className="absolute -top-2 -right-2 h-6 w-6 text-yellow-400 fill-yellow-400 animate-bounce" style={{ animationDelay: '0.1s' }} />
                                <Star className="absolute bottom-0 -left-2 h-4 w-4 text-yellow-300 fill-yellow-300 animate-bounce" style={{ animationDelay: '0.3s' }} />
                            </>
                        )}
                    </div>

                    <h2 className="text-3xl font-black text-slate-900 dark:text-white mb-1">
                        {isNegative ? "" : "+"}{amount} XP
                    </h2>

                    <p className={`text-sm font-medium ${textColor} mb-4 uppercase tracking-wider`}>
                        {readableAction}
                    </p>

                    <p className="text-slate-600 dark:text-slate-300 mb-8 leading-relaxed">
                        {encouragingText} {isNegative ? "This action reduced your XP." : "Check your profile to see your progress to the next level."}
                    </p>

                    <button
                        onClick={handleClose}
                        className={`w-full py-3.5 px-6 rounded-xl font-bold text-lg hover:scale-[1.02] active:scale-[0.98] transition-all shadow-lg hover:shadow-xl ${buttonBg}`}
                    >
                        {isNegative ? "Understood" : "Okay, Awesome!"}
                    </button>
                </div>
            </div>
        </div>
    );
}
