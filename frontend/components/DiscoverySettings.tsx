"use client";

import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";
import { motion, AnimatePresence } from "framer-motion";
import { apiFetch } from "@/app/lib/http/client";
import { DiscoveryProfile, DiscoveryProfileUpdate } from "@/lib/types";
import { Check, Flame, Loader2, Sparkles, AlertCircle } from "lucide-react";

export type DiscoveryPrompt = {
    id: string;
    category: string;
    question: string;
    field_key: string;
    type: string;
    options?: string[];
};

export default function DiscoverySettings() {
    const [prompts, setPrompts] = useState<DiscoveryPrompt[]>([]);
    const [answers, setAnswers] = useState<Record<string, unknown>>({});
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [saveSuccess, setSaveSuccess] = useState(false);

    useEffect(() => {
        setLoading(true);
        Promise.all([
            apiFetch<DiscoveryPrompt[]>("/discovery/prompts"),
            apiFetch<DiscoveryProfile>("/discovery/profile")
        ]).then(([p, profile]) => {
            setPrompts(p);
            // Flatten answers for easier binding
            const flat: Record<string, unknown> = {};
            if (profile) {
                ['core_identity', 'personality', 'campus_life', 'dating_adjacent', 'taste', 'playful'].forEach(cat => {
                    const section = (profile as Record<string, unknown>)[cat] as Record<string, unknown> | undefined;
                    if (section) {
                        Object.assign(flat, section);
                    }
                });
            }
            // Auto tags are array, but prompts are usually single value in this system unless handled otherwise
            setAnswers(flat);
            setLoading(false);
        }).catch(err => {
            console.error(err);
            setError("Failed to load discovery profile.");
            setLoading(false);
        });
    }, []);

    const categories = Array.from(new Set(prompts.map(p => p.category)));

    const handleSave = async (specificField?: string, value?: unknown) => {
        const nextAnswers = specificField ? { ...answers, [specificField]: value } : answers;
        if (specificField) setAnswers(nextAnswers); // Optimistic update

        setSaving(true);
        setSaveSuccess(false);

        // Reconstruct hierarchical object
        const update: DiscoveryProfileUpdate = {};
        prompts.forEach(p => {
            const val = nextAnswers[p.field_key];
            if (val) {
                if (!(update as Record<string, Record<string, unknown>>)[p.category]) (update as Record<string, Record<string, unknown>>)[p.category] = {};
                (update as Record<string, Record<string, unknown>>)[p.category][p.field_key] = val;
            }
        });

        try {
            await apiFetch("/discovery/profile", {
                method: "PUT",
                body: update
            });
            setSaveSuccess(true);
            setTimeout(() => setSaveSuccess(false), 2000);
        } catch (err) {
            console.error("Failed to save vibe profile", err);
            setError("Failed to save changes.");
        } finally {
            setSaving(false);
        }
    };

    // Calculate completion
    // Assuming each prompt is worth an equal amount for simplicity, or we can hardcode 5-10% logic.
    // Let's make it proportional to total prompts available.
    const totalPrompts = prompts.length;
    const answeredCount = prompts.filter(p => answers[p.field_key] && answers[p.field_key].toString().length > 0).length;
    const progress = totalPrompts > 0 ? (answeredCount / totalPrompts) * 100 : 0;

    // Gamification text
    // "10 percent or 5 percent each" -> We simply show actual percentage.
    const percentPerItem = totalPrompts > 0 ? Math.round(100 / totalPrompts) : 0;

    if (loading) {
        return (
            <div className="flex h-64 flex-col items-center justify-center gap-4">
                <Loader2 className="h-8 w-8 animate-spin text-indigo-500" />
                <p className="text-slate-500 font-medium">Loading your vibes...</p>
            </div>
        );
    }

    if (error) {
        return (
            <div className="p-4 rounded-xl bg-rose-50 border border-rose-100 flex items-center gap-3 text-rose-700">
                <AlertCircle size={20} />
                <p>{error}</p>
            </div>
        );
    }

    return (
        <section className="space-y-8">
            <header>
                <h2 className="text-xl font-bold text-slate-900 mb-2 flex items-center gap-2">
                    <Sparkles className="text-indigo-500" size={24} /> Discovery Vibe
                </h2>
                <p className="text-slate-500 text-sm">
                    Customize how you appear in the Discovery feed.
                </p>

                {/* Progress Bar & Motivation */}
                <div className="mt-6 p-5 rounded-2xl bg-gradient-to-r from-indigo-500 to-purple-600 text-white shadow-lg relative overflow-hidden">
                    <div className="relative z-10 flex items-start justify-between gap-4">
                        <div className="flex-1">
                            <div className="flex items-center gap-2 mb-2">
                                <span className="text-3xl font-black">{Math.round(progress)}%</span>
                                <span className="text-sm font-medium opacity-90 uppercase tracking-wide">Completed</span>
                            </div>
                            <p className="text-sm font-medium opacity-90 leading-relaxed max-w-sm">
                                {progress === 100
                                    ? "You're a superstar! Maximum visibility unlocked. 🚀"
                                    : "The more you fill out, the more you are visible in discovery."}
                            </p>
                            <p className="text-xs mt-2 opacity-70">
                                (+{percentPerItem}% visibility per item)
                            </p>
                        </div>
                        <div className="h-16 w-16 bg-white/10 rounded-full flex items-center justify-center backdrop-blur-sm border border-white/20">
                            <Flame size={32} className={progress > 50 ? "text-orange-300 fill-orange-300" : "text-white/50"} />
                        </div>
                    </div>

                    {/* Progress Bar Background */}
                    <div className="mt-4 h-2 w-full bg-black/20 rounded-full overflow-hidden">
                        <motion.div
                            className="h-full bg-white shadow-[0_0_10px_rgba(255,255,255,0.5)]"
                            initial={{ width: 0 }}
                            animate={{ width: `${progress}%` }}
                            transition={{ duration: 1, ease: "easeOut" }}
                        />
                    </div>
                </div>
            </header>

            {/* Categories */}
            <div className="space-y-10">
                {categories.map(category => (
                    <div key={category} className="space-y-4">
                        <div className="flex items-center gap-3 pb-2 border-b border-slate-100">
                            <h3 className="text-lg font-bold capitalize text-slate-800">
                                {category.replace(/_/g, ' ')}
                            </h3>
                            {/* Category Completion Indicator */}
                            {prompts.filter(p => p.category === category).every(p => answers[p.field_key]) && (
                                <span className="text-xs bg-emerald-100 text-emerald-700 font-bold px-2 py-0.5 rounded-full flex items-center gap-1">
                                    <Check size={10} strokeWidth={4} /> Done
                                </span>
                            )}
                        </div>

                        <div className="grid gap-6 md:grid-cols-2">
                            {prompts.filter(p => p.category === category).map(p => (
                                <div key={p.id} className="space-y-2">
                                    <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">
                                        {p.question}
                                    </label>

                                    {p.options && p.options.length > 0 ? (
                                        <div className="flex flex-wrap gap-2">
                                            {p.options.map(opt => (
                                                <button
                                                    key={opt}
                                                    onClick={() => handleSave(p.field_key, opt)}
                                                    className={cn(
                                                        "px-3 py-1.5 rounded-lg text-sm font-medium transition-all border",
                                                        answers[p.field_key] === opt
                                                            ? "bg-indigo-600 border-indigo-600 text-white shadow-md shadow-indigo-200"
                                                            : "bg-white border-slate-200 text-slate-600 hover:border-slate-300 hover:bg-slate-50"
                                                    )}
                                                >
                                                    {opt}
                                                </button>
                                            ))}
                                        </div>
                                    ) : (
                                        <div className="relative">
                                            <input
                                                type="text"
                                                value={answers[p.field_key] || ''}
                                                onChange={(e) => setAnswers(prev => ({ ...prev, [p.field_key]: e.target.value }))}
                                                onBlur={(e) => handleSave(p.field_key, e.target.value)}
                                                placeholder="Your answer..."
                                                className="w-full px-4 py-2.5 rounded-xl border border-slate-200 bg-slate-50 focus:bg-white focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition"
                                            />
                                            {answers[p.field_key] && (
                                                <div className="absolute right-3 top-2.5 text-emerald-500 pointer-events-none">
                                                    <Check size={16} />
                                                </div>
                                            )}
                                        </div>
                                    )}
                                </div>
                            ))}
                        </div>
                    </div>
                ))}
            </div>

            {/* Global Save Indicator */}
            <div className="fixed bottom-6 right-6 z-50">
                <AnimatePresence>
                    {saveSuccess && (
                        <motion.div
                            initial={{ opacity: 0, y: 10 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, y: 10 }}
                            className="bg-emerald-600 text-white px-4 py-2 rounded-full shadow-xl flex items-center gap-2 font-medium text-sm"
                        >
                            <Check size={16} /> Saved!
                        </motion.div>
                    )}
                    {saving && !saveSuccess && (
                        <motion.div
                            initial={{ opacity: 0, y: 10 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, y: 10 }}
                            className="bg-slate-800 text-white px-4 py-2 rounded-full shadow-xl flex items-center gap-2 font-medium text-sm"
                        >
                            <Loader2 size={14} className="animate-spin" /> Saving...
                        </motion.div>
                    )}
                </AnimatePresence>
            </div>
        </section>
    );
}
