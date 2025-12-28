"use client";

import { useEffect, useState } from "react";
import { X, ChevronRight, Check } from "lucide-react";
import { cn } from "@/lib/utils";
import { motion, AnimatePresence } from "framer-motion";
import { apiFetch } from "@/app/lib/http/client";
import { DiscoveryProfile, DiscoveryProfileUpdate } from "@/lib/types";

// Schema for Prompts
export type DiscoveryPrompt = {
    id: string;
    category: string;
    question: string;
    field_key: string;
    type: string;
    options?: string[];
};

interface DiscoveryOnboardingModalProps {
    isOpen: boolean;
    onClose: () => void;
}

export function DiscoveryOnboardingModal({ isOpen, onClose }: DiscoveryOnboardingModalProps) {
    const [prompts, setPrompts] = useState<DiscoveryPrompt[]>([]);
    const [answers, setAnswers] = useState<Record<string, unknown>>({});
    const [currentStep, setCurrentStep] = useState(0);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);

    useEffect(() => {
        if (!isOpen) {
            setCurrentStep(0);
            return;
        }
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
            setAnswers(flat);
            setLoading(false);
        }).catch(err => {
            console.error(err);
            setLoading(false);
        });
    }, [isOpen]);

    const categories = Array.from(new Set(prompts.map(p => p.category)));
    const currentCategory = categories[currentStep];
    const categoryPrompts = prompts.filter(p => p.category === currentCategory);

    const handleSave = async () => {
        setSaving(true);
        // Reconstruct hierarchical object
        const update: DiscoveryProfileUpdate = {};

        prompts.forEach(p => {
            const val = answers[p.field_key];
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
            onClose();
        } catch (err) {
            console.error("Failed to save vibe profile", err);
        } finally {
            setSaving(false);
        }
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in">
            <div className="w-full max-w-2xl bg-white rounded-3xl overflow-hidden shadow-2xl flex flex-col max-h-[90vh]">
                {/* Header */}
                <div className="p-6 border-b border-slate-100 flex justify-between items-center bg-slate-50">
                    <div>
                        <h2 className="text-xl font-bold text-slate-900">Build Your Vibe</h2>
                        <p className="text-sm text-slate-500">Step {currentStep + 1} of {categories.length}</p>
                    </div>
                    <button onClick={onClose} className="p-2 hover:bg-slate-200 rounded-full transition">
                        <X size={20} className="text-slate-500" />
                    </button>
                </div>

                {/* Progress */}
                <div className="h-1 w-full bg-slate-100">
                    <div
                        className="h-full bg-indigo-600 transition-all duration-300"
                        style={{ width: `${((currentStep + 1) / categories.length) * 100}%` }}
                    />
                </div>

                {/* Content */}
                <div className="flex-1 overflow-y-auto p-8 relative">
                    {loading ? (
                        <div className="h-64 flex flex-col items-center justify-center gap-4">
                            <motion.div
                                animate={{ rotate: 360 }}
                                transition={{ repeat: Infinity, duration: 1, ease: "linear" }}
                                className="h-10 w-10 border-4 border-indigo-600 border-t-transparent rounded-full"
                            />
                            <p className="text-slate-500 font-medium animate-pulse">Fetching your vibe...</p>
                        </div>
                    ) : (
                        <AnimatePresence mode="wait">
                            <motion.div
                                key={currentCategory}
                                initial={{ opacity: 0, x: 20 }}
                                animate={{ opacity: 1, x: 0 }}
                                exit={{ opacity: 0, x: -20 }}
                                transition={{ duration: 0.3 }}
                                className="space-y-6"
                            >
                                <h3 className="text-2xl font-bold capitalize text-slate-800 tracking-tight">
                                    {currentCategory?.replace('_', ' ')}
                                </h3>

                                <div className="space-y-8">
                                    {categoryPrompts.map(p => (
                                        <div key={p.id} className="space-y-3">
                                            <label className="block text-sm font-bold text-slate-700">
                                                {p.question}
                                            </label>

                                            {p.options && p.options.length > 0 ? (
                                                <div className="flex flex-wrap gap-2">
                                                    {p.options.map(opt => (
                                                        <button
                                                            key={opt}
                                                            onClick={() => setAnswers(prev => ({ ...prev, [p.field_key]: opt }))}
                                                            className={cn(
                                                                "px-4 py-2 rounded-xl text-sm font-semibold transition-all border-2",
                                                                answers[p.field_key] === opt
                                                                    ? "bg-indigo-600 border-indigo-600 text-white shadow-md"
                                                                    : "bg-white border-slate-200 text-slate-600 hover:border-slate-300"
                                                            )}
                                                        >
                                                            {opt}
                                                        </button>
                                                    ))}
                                                </div>
                                            ) : (
                                                <input
                                                    type="text"
                                                    value={(answers[p.field_key] as string) || ''}
                                                    onChange={(e) => setAnswers(prev => ({ ...prev, [p.field_key]: e.target.value }))}
                                                    placeholder="Type your answer..."
                                                    className="w-full p-4 rounded-2xl bg-slate-50 border-0 ring-1 ring-slate-200 focus:ring-2 focus:ring-indigo-500 transition shadow-sm"
                                                />
                                            )}
                                        </div>
                                    ))}
                                </div>
                            </motion.div>
                        </AnimatePresence>
                    )}
                </div>

                {/* Footer */}
                <div className="p-6 border-t border-slate-100 bg-slate-50 flex justify-between">
                    <button
                        onClick={() => setCurrentStep(Math.max(0, currentStep - 1))}
                        disabled={currentStep === 0}
                        className="px-6 py-3 rounded-xl font-semibold text-slate-600 disabled:opacity-50 hover:bg-slate-200 transition"
                    >
                        Back
                    </button>

                    {currentStep < categories.length - 1 ? (
                        <button
                            onClick={() => setCurrentStep(currentStep + 1)}
                            className="px-6 py-3 rounded-xl bg-slate-900 text-white font-semibold hover:bg-slate-800 transition flex items-center gap-2"
                        >
                            Next <ChevronRight size={16} />
                        </button>
                    ) : (
                        <button
                            onClick={handleSave}
                            disabled={saving}
                            className="px-8 py-3 rounded-xl bg-indigo-600 text-white font-bold hover:bg-indigo-700 transition flex items-center gap-2 shadow-lg shadow-indigo-200 disabled:opacity-50"
                        >
                            {saving ? (
                                <>
                                    <motion.div
                                        animate={{ rotate: 360 }}
                                        transition={{ repeat: Infinity, duration: 1, ease: "linear" }}
                                        className="h-4 w-4 border-2 border-white border-t-transparent rounded-full"
                                    />
                                    Syncing...
                                </>
                            ) : (
                                <>
                                    Complete Profile <Check size={16} />
                                </>
                            )}
                        </button>
                    )}
                </div>
            </div>
        </div>
    );
}
