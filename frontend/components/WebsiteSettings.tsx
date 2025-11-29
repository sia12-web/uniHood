"use client";

import { useEffect, useState } from "react";

type WebsiteSettingsState = {
    theme: "light" | "dark" | "system";
    notifications: boolean;
    soundEffects: boolean;
};

const DEFAULT_SETTINGS: WebsiteSettingsState = {
    theme: "system",
    notifications: true,
    soundEffects: true,
};

export default function WebsiteSettings() {
    const [settings, setSettings] = useState<WebsiteSettingsState>(DEFAULT_SETTINGS);
    const [mounted, setMounted] = useState(false);

    useEffect(() => {
        setMounted(true);
        const stored = localStorage.getItem("divan.website.settings");
        if (stored) {
            try {
                setSettings(JSON.parse(stored));
            } catch (e) {
                console.error("Failed to parse settings", e);
            }
        }
    }, []);

    useEffect(() => {
        if (mounted) {
            localStorage.setItem("divan.website.settings", JSON.stringify(settings));
            // Apply theme
            if (settings.theme === "dark" || (settings.theme === "system" && window.matchMedia("(prefers-color-scheme: dark)").matches)) {
                document.documentElement.classList.add("dark");
            } else {
                document.documentElement.classList.remove("dark");
            }
        }
    }, [settings, mounted]);

    const toggleNotifications = () => setSettings(prev => ({ ...prev, notifications: !prev.notifications }));
    const toggleSound = () => setSettings(prev => ({ ...prev, soundEffects: !prev.soundEffects }));
    const setTheme = (theme: WebsiteSettingsState["theme"]) => setSettings(prev => ({ ...prev, theme }));

    if (!mounted) return null;

    return (
        <section className="rounded-3xl border border-slate-200 bg-white/80 p-6 shadow-sm backdrop-blur">
            <header className="mb-6">
                <h2 className="text-xl font-semibold text-slate-900">Website Settings</h2>
                <p className="text-sm text-slate-600">Customize your experience on Divan.</p>
            </header>

            <div className="space-y-6">
                <div className="flex items-center justify-between">
                    <div>
                        <p className="font-medium text-slate-900">Appearance</p>
                        <p className="text-sm text-slate-500">Choose your preferred theme.</p>
                    </div>
                    <div className="flex rounded-lg bg-slate-100 p-1">
                        {(["light", "system", "dark"] as const).map((t) => (
                            <button
                                key={t}
                                onClick={() => setTheme(t)}
                                className={`rounded-md px-3 py-1.5 text-sm font-medium transition-all ${settings.theme === t
                                        ? "bg-white text-slate-900 shadow-sm"
                                        : "text-slate-500 hover:text-slate-700"
                                    }`}
                            >
                                {t.charAt(0).toUpperCase() + t.slice(1)}
                            </button>
                        ))}
                    </div>
                </div>

                <div className="flex items-center justify-between">
                    <div>
                        <p className="font-medium text-slate-900">Notifications</p>
                        <p className="text-sm text-slate-500">Enable push notifications.</p>
                    </div>
                    <button
                        onClick={toggleNotifications}
                        className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${settings.notifications ? "bg-rose-500" : "bg-slate-200"
                            }`}
                    >
                        <span
                            className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${settings.notifications ? "translate-x-6" : "translate-x-1"
                                }`}
                        />
                    </button>
                </div>

                <div className="flex items-center justify-between">
                    <div>
                        <p className="font-medium text-slate-900">Sound Effects</p>
                        <p className="text-sm text-slate-500">Play sounds for interactions.</p>
                    </div>
                    <button
                        onClick={toggleSound}
                        className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${settings.soundEffects ? "bg-rose-500" : "bg-slate-200"
                            }`}
                    >
                        <span
                            className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${settings.soundEffects ? "translate-x-6" : "translate-x-1"
                                }`}
                        />
                    </button>
                </div>
            </div>
        </section>
    );
}
