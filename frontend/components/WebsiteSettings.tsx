"use client";

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
            </div>
        </section>
    );
}
