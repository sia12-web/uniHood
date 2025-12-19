"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { fetchNotificationPreferences, updateNotificationPreferences } from "@/lib/identity";

type WebsiteSettingsState = {
    theme: "system" | "dark";
    notifications: boolean;
};

const DEFAULT_SETTINGS: WebsiteSettingsState = {
    theme: "system",
    notifications: true,
};

export default function WebsiteSettings() {
    const [settings, setSettings] = useState<WebsiteSettingsState>(DEFAULT_SETTINGS);
    const [mounted, setMounted] = useState(false);

    useEffect(() => {
        setMounted(true);
        const stored = localStorage.getItem("unihood.website.settings");
        if (stored) {
            try {
                const parsed = JSON.parse(stored);
                // Map old "light" to "system", and ensure valid theme
                const storedTheme = parsed.theme;
                const validTheme: "system" | "dark" = storedTheme === "dark" ? "dark" : "system";
                setSettings(prev => ({ ...prev, theme: validTheme }));
            } catch (e) {
                console.error("Failed to parse settings", e);
            }
        }

        // Fetch real notification prefs
        fetchNotificationPreferences()
            .then(prefs => {
                // If any pref is true, we consider notifications "on"
                const isOn = Object.values(prefs).some(v => v === true);
                setSettings(prev => ({ ...prev, notifications: isOn }));
            })
            .catch(err => console.error("Failed to fetch notification prefs", err));
    }, []);

    useEffect(() => {
        if (mounted) {
            localStorage.setItem("unihood.website.settings", JSON.stringify({ theme: settings.theme }));
            // Apply theme
            if (settings.theme === "dark" || (settings.theme === "system" && window.matchMedia("(prefers-color-scheme: dark)").matches)) {
                document.documentElement.classList.add("dark");
            } else {
                document.documentElement.classList.remove("dark");
            }
        }
    }, [settings.theme, mounted]);

    const toggleNotifications = async () => {
        const nextState = !settings.notifications;
        setSettings(prev => ({ ...prev, notifications: nextState }));

        try {
            // Update all prefs to match the toggle
            await updateNotificationPreferences({
                invites: nextState,
                friends: nextState,
                chat: nextState,
                rooms: nextState,
                activities: nextState,
            });
        } catch (err) {
            console.error("Failed to update notification prefs", err);
        }
    };

    const setTheme = (theme: WebsiteSettingsState["theme"]) => setSettings(prev => ({ ...prev, theme }));

    if (!mounted) return null;

    return (
        <section className="rounded-3xl border border-slate-200 dark:border-slate-700 bg-white/80 dark:bg-slate-900/80 p-6 shadow-sm backdrop-blur">
            <header className="mb-6">
                <h2 className="text-xl font-semibold text-slate-900 dark:text-slate-100">Website Settings</h2>
                <p className="text-sm text-slate-600 dark:text-slate-400">Customize your experience on uniHood.</p>
            </header>

            <div className="space-y-6">
                <div className="flex items-center justify-between">
                    <div>
                        <p className="font-medium text-slate-900 dark:text-slate-100">Appearance</p>
                        <p className="text-sm text-slate-500 dark:text-slate-400">Choose your preferred theme.</p>
                    </div>
                    <div className="flex rounded-lg bg-slate-100 dark:bg-slate-800 p-1">
                        {(["system", "dark"] as const).map((t) => (
                            <button
                                key={t}
                                onClick={() => setTheme(t)}
                                className={`rounded-md px-3 py-1.5 text-sm font-medium transition-all ${settings.theme === t
                                    ? "bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-100 shadow-sm"
                                    : "text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200"
                                    }`}
                            >
                                {t.charAt(0).toUpperCase() + t.slice(1)}
                            </button>
                        ))}
                    </div>
                </div>

                <div className="flex items-center justify-between">
                    <div>
                        <p className="font-medium text-slate-900 dark:text-slate-100">Notifications</p>
                        <p className="text-sm text-slate-500 dark:text-slate-400">Enable push notifications.</p>
                    </div>
                    <button
                        onClick={toggleNotifications}
                        aria-label={settings.notifications ? "Disable notifications" : "Enable notifications"}
                        className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${settings.notifications ? "bg-rose-500" : "bg-slate-200 dark:bg-slate-600"
                            }`}
                    >
                        <span
                            className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${settings.notifications ? "translate-x-6" : "translate-x-1"
                                }`}
                        />
                    </button>
                </div>

                <div className="pt-6 border-t border-slate-200 dark:border-slate-800">
                    <p className="font-medium text-slate-900 dark:text-slate-100 mb-4">Legal & Support</p>
                    <div className="flex flex-col gap-3">
                        <Link href="/contact" className="flex items-center justify-between text-sm text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200">
                            <span>Contact Support</span>
                            <span className="text-slate-400">→</span>
                        </Link>
                        <Link href="/terms" className="flex items-center justify-between text-sm text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200">
                            <span>Terms of Service</span>
                            <span className="text-slate-400">→</span>
                        </Link>
                        <Link href="/privacy" className="flex items-center justify-between text-sm text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200">
                            <span>Privacy Policy</span>
                            <span className="text-slate-400">→</span>
                        </Link>
                        <Link href="/cookies" className="flex items-center justify-between text-sm text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200">
                            <span>Cookie Policy</span>
                            <span className="text-slate-400">→</span>
                        </Link>
                    </div>
                </div>

                <div className="pt-6 border-t border-slate-200 dark:border-slate-800">
                    <button
                        type="button"
                        onClick={() => {
                            if (typeof window !== "undefined") {
                                window.localStorage.clear();
                                window.location.replace("/login");
                            }
                        }}
                        className="flex w-full items-center justify-center gap-2 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-bold text-rose-600 transition hover:bg-rose-100 hover:border-rose-300"
                    >
                        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-4 w-4">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 9V5.25A2.25 2.25 0 0013.5 3h-6a2.25 2.25 0 00-2.25 2.25v13.5A2.25 2.25 0 007.5 21h6a2.25 2.25 0 002.25-2.25V15M12 9l-3 3m0 0l3 3m-3-3h12.75" />
                        </svg>
                        Sign out
                    </button>
                    <p className="mt-4 text-center text-xs text-slate-400">
                        Version 1.2.0 (Stable)
                    </p>
                </div>
            </div>
        </section>
    );
}
