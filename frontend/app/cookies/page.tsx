"use client";

import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { Cookie, ShieldCheck, BarChart3, Target, Settings2, Check } from "lucide-react";
import BackButton from "@/components/BackButton";
import { getCookieConsent, setCookieConsent, type CookieConsent } from "@/lib/cookies";

export default function CookiesPage() {
    const [consent, setConsent] = useState<CookieConsent | null>(null);
    const [saved, setSaved] = useState(false);

    useEffect(() => {
        setConsent(getCookieConsent());
    }, []);

    const handleToggle = (key: keyof Omit<CookieConsent, "essential" | "acknowledgedAt">) => {
        if (!consent) return;
        const next = { ...consent, [key]: !consent[key] };
        setConsent(next);
    };

    const handleSave = () => {
        if (!consent) return;
        setCookieConsent(consent);
        setSaved(true);
        setTimeout(() => setSaved(false), 3000);
    };

    if (!consent) return null;

    const categories = [
        {
            id: "essential",
            title: "Essential Cookies",
            description: "These cookies are necessary for the website to function and cannot be switched off in our systems. They are usually only set in response to actions made by you which amount to a request for services, such as setting your privacy preferences, logging in or filling in forms.",
            icon: <ShieldCheck className="text-emerald-500" />,
            required: true,
        },
        {
            id: "functional",
            title: "Functional Cookies",
            description: "These cookies enable the website to provide enhanced functionality and personalisation. They may be set by us or by third party providers whose services we have added to our pages. If you do not allow these cookies then some or all of these services may not function properly.",
            icon: <Settings2 className="text-blue-500" />,
            required: false,
        },
        {
            id: "analytics",
            title: "Analytics Cookies",
            description: "These cookies allow us to count visits and traffic sources so we can measure and improve the performance of our site. They help us to know which pages are the most and least popular and see how visitors move around the site. All information these cookies collect is aggregated and therefore anonymous.",
            icon: <BarChart3 className="text-amber-500" />,
            required: false,
        },
        {
            id: "marketing",
            title: "Marketing Cookies",
            description: "These cookies may be set through our site by our advertising partners. They may be used by those companies to build a profile of your interests and show you relevant adverts on other sites. They do not store directly personal information, but are based on uniquely identifying your browser and internet device.",
            icon: <Target className="text-rose-500" />,
            required: false,
        },
    ];

    return (
        <main className="min-h-screen bg-gradient-to-br from-cream via-white to-warm-sand/30 dark:from-slate-950 dark:via-slate-900 dark:to-slate-950 px-6 py-12">
            <div className="mx-auto max-w-4xl">
                <header className="mb-10">
                    <div className="mb-6">
                        <BackButton label="Back" fallbackHref="/" className="bg-white/50 dark:bg-slate-900/50 backdrop-blur-sm" />
                    </div>
                    <div className="flex items-center gap-4 mb-2">
                        <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-indigo-100 text-indigo-600 dark:bg-indigo-900/50 dark:text-indigo-400">
                            <Cookie size={28} />
                        </div>
                        <h1 className="text-3xl font-bold text-slate-900 dark:text-slate-100 sm:text-4xl">Cookie Settings</h1>
                    </div>
                    <p className="text-lg text-slate-600 dark:text-slate-400 max-w-2xl">
                        Manage your privacy and decide how we use cookies. Your choices are stored locally and respected across our platform.
                    </p>
                </header>

                <div className="grid gap-6">
                    {categories.map((cat) => (
                        <motion.div
                            key={cat.id}
                            initial={{ opacity: 0, y: 20 }}
                            animate={{ opacity: 1, y: 0 }}
                            className="group relative overflow-hidden rounded-3xl border border-slate-200 bg-white/80 p-6 shadow-sm transition-all hover:shadow-md dark:border-slate-800 dark:bg-slate-900/80 sm:p-8"
                        >
                            <div className="flex flex-col gap-6 sm:flex-row sm:items-start">
                                <div className="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-xl bg-slate-50 dark:bg-slate-800">
                                    {cat.icon}
                                </div>

                                <div className="flex-grow">
                                    <div className="flex items-center justify-between mb-2">
                                        <h2 className="text-xl font-bold text-slate-900 dark:text-slate-100">{cat.title}</h2>
                                        {cat.required ? (
                                            <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-bold text-slate-500 dark:bg-slate-800 dark:text-slate-400">
                                                Always Active
                                            </span>
                                        ) : (
                                            <button
                                                onClick={() => handleToggle(cat.id as any)}
                                                className={`relative h-7 w-12 rounded-full transition-colors duration-300 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 ${consent[cat.id as keyof CookieConsent] ? "bg-indigo-600" : "bg-slate-200 dark:bg-slate-700"
                                                    }`}
                                            >
                                                <span
                                                    className={`absolute left-1 top-1 h-5 w-5 transform rounded-full bg-white transition-transform duration-300 ${consent[cat.id as keyof CookieConsent] ? "translate-x-5" : ""
                                                        }`}
                                                />
                                            </button>
                                        )}
                                    </div>
                                    <p className="text-sm leading-relaxed text-slate-500 dark:text-slate-400">
                                        {cat.description}
                                    </p>
                                </div>
                            </div>
                        </motion.div>
                    ))}
                </div>

                <footer className="mt-12 flex flex-col items-center gap-6 sm:flex-row sm:justify-between">
                    <div className="text-sm text-slate-500 dark:text-slate-500">
                        {consent.acknowledgedAt && (
                            <p>Preferences last updated: {new Date(consent.acknowledgedAt).toLocaleDateString()}</p>
                        )}
                    </div>

                    <button
                        onClick={handleSave}
                        disabled={saved}
                        className={`flex items-center justify-center gap-2 rounded-2xl px-8 py-4 text-sm font-bold shadow-xl transition-all active:scale-95 ${saved
                                ? "bg-emerald-500 text-white shadow-emerald-200 dark:shadow-none"
                                : "bg-indigo-600 text-white shadow-indigo-200 hover:bg-indigo-500 dark:shadow-none"
                            }`}
                    >
                        {saved ? (
                            <>
                                <Check size={18} />
                                <span>Preferences Saved</span>
                            </>
                        ) : (
                            <span>Save My Choices</span>
                        )}
                    </button>
                </footer>
            </div>
        </main>
    );
}
