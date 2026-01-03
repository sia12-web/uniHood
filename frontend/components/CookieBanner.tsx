"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { motion, AnimatePresence } from "framer-motion";
import { Cookie, ChevronRight } from "lucide-react";
import { getCookieConsent, acceptAllCookies, declineOptionalCookies } from "@/lib/cookies";

export default function CookieBanner() {
    const [isVisible, setIsVisible] = useState(false);

    useEffect(() => {
        // Check if user has already acknowledged
        const consent = getCookieConsent();
        if (!consent.acknowledgedAt) {
            const timer = setTimeout(() => setIsVisible(true), 1500); // Delay for better UX
            return () => clearTimeout(timer);
        }
    }, []);

    const handleAcceptAll = () => {
        acceptAllCookies();
        setIsVisible(false);
    };

    const handleDecline = () => {
        declineOptionalCookies();
        setIsVisible(false);
    };

    return (
        <AnimatePresence>
            {isVisible && (
                <motion.div
                    initial={{ y: 100, opacity: 0 }}
                    animate={{ y: 0, opacity: 1 }}
                    exit={{ y: 100, opacity: 0 }}
                    transition={{ type: "spring", stiffness: 300, damping: 30 }}
                    className="fixed inset-x-0 bottom-4 z-[9999] mx-auto w-full max-w-4xl px-4 sm:bottom-6"
                >
                    <div className="overflow-hidden rounded-3xl border border-white/20 bg-white/80 p-6 shadow-2xl backdrop-blur-xl dark:border-slate-800 dark:bg-slate-900/80 sm:p-8">
                        <div className="flex flex-col gap-6 sm:flex-row sm:items-center">
                            <div className="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-2xl bg-indigo-100 text-indigo-600 dark:bg-indigo-900/50 dark:text-indigo-400">
                                <Cookie size={24} />
                            </div>

                            <div className="flex-grow">
                                <h3 className="text-lg font-bold text-slate-900 dark:text-slate-100">
                                    We use cookies to improve your experience
                                </h3>
                                <p className="mt-1 text-sm leading-relaxed text-slate-600 dark:text-slate-400">
                                    We use cookies to personalize content, provide social media features, and analyze our traffic.
                                    By clicking &quot;Accept All&quot;, you consent to our use of all cookies. You can manage your preferences in our
                                    <Link href="/cookies" className="mx-1 font-medium text-indigo-600 hover:text-indigo-500 dark:text-indigo-400">
                                        Cookie Settings
                                    </Link>.
                                </p>
                            </div>

                            <div className="flex flex-col gap-3 sm:flex-shrink-0 sm:flex-row">
                                <button
                                    onClick={handleDecline}
                                    className="rounded-xl px-4 py-2 text-sm font-semibold text-slate-600 transition hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800"
                                >
                                    Essential only
                                </button>
                                <button
                                    onClick={handleAcceptAll}
                                    className="flex items-center justify-center gap-2 rounded-xl bg-indigo-600 px-6 py-3 text-sm font-bold text-white shadow-lg shadow-indigo-200 transition-all hover:bg-indigo-500 hover:shadow-indigo-300 active:scale-95 dark:shadow-none"
                                >
                                    <span>Accept All</span>
                                    <ChevronRight size={16} />
                                </button>
                            </div>
                        </div>
                    </div>
                </motion.div>
            )}
        </AnimatePresence>
    );
}
