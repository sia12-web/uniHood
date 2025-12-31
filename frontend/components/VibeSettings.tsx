/* eslint-disable react/no-unescaped-entities */
"use client";

import { useState } from "react";
import type { ProfileRecord } from "@/lib/types";
import type { ProfilePatchPayload } from "@/lib/identity";
import { Check, Loader2 } from "lucide-react";

type VibeSettingsProps = {
    profile: ProfileRecord;
    onSubmit: (patch: ProfilePatchPayload) => Promise<ProfileRecord>;
};

const RELATIONSHIP_STATUSES = ["Single", "Taken", "It's Complicated", "Open to possibilities"];
const ORIENTATIONS = ["Straight", "Gay", "Lesbian", "Bisexual", "Pansexual", "Queer", "Questioning", "Prefer not to say"];
const LOOKING_FOR_OPTIONS = ["Friends", "Dates", "Study Buddy", "Networking", "Gym Buddy"];
const LIFESTYLE_OPTIONS = {
    drinking: ["Yes", "Socially", "No"],
    smoking: ["Yes", "Socially", "No"],
    workout: ["Active", "Sometimes", "Never"],
};

const VIBE_PROMPTS = [
    "A non-negotiable for me is...",
    "My simple pleasures...",
    "I'm looking for...",
    "Best spot on campus is...",
    "I geek out on...",
    "My ideal weekend is...",
];

export default function VibeSettings({ profile, onSubmit }: VibeSettingsProps) {
    const [relationshipStatus, setRelationshipStatus] = useState(profile.relationship_status ?? "");
    const [sexualOrientation, setSexualOrientation] = useState(profile.sexual_orientation ?? "");
    const [lookingFor, setLookingFor] = useState<string[]>(profile.looking_for ?? []);

    // Lifestyle
    const [drinking, setDrinking] = useState((profile.lifestyle as Record<string, string>)?.drinking ?? "");
    const [smoking, setSmoking] = useState((profile.lifestyle as Record<string, string>)?.smoking ?? "");
    const [workout, setWorkout] = useState((profile.lifestyle as Record<string, string>)?.workout ?? "");

    // Prompts
    const initialPrompts = profile.profile_prompts && profile.profile_prompts.length > 0
        ? profile.profile_prompts
        : [{ question: VIBE_PROMPTS[0], answer: "" }];

    const [prompts, setPrompts] = useState<{ question: string; answer: string }[]>(initialPrompts);
    const [saving, setSaving] = useState(false);
    const [success, setSuccess] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const toggleLookingFor = (option: string) => {
        setLookingFor(prev =>
            prev.includes(option) ? prev.filter(p => p !== option) : [...prev, option]
        );
    };

    const updatePrompt = (index: number, field: 'question' | 'answer', value: string) => {
        const newPrompts = [...prompts];
        newPrompts[index] = { ...newPrompts[index], [field]: value };
        setPrompts(newPrompts);
    };

    const addPrompt = () => {
        if (prompts.length < 3) {
            setPrompts([...prompts, { question: VIBE_PROMPTS[0], answer: "" }]);
        }
    };

    const removePrompt = (index: number) => {
        setPrompts(prompts.filter((_, i) => i !== index));
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setSaving(true);
        setSuccess(false);
        setError(null);

        try {
            const validPrompts = prompts.filter(p => p.answer.trim().length > 0);
            const lifestyle = { drinking, smoking, workout };

            await onSubmit({
                relationship_status: relationshipStatus || null,
                sexual_orientation: sexualOrientation || null,
                looking_for: lookingFor.length > 0 ? lookingFor : null,
                lifestyle,
                profile_prompts: validPrompts.length > 0 ? validPrompts : null,
            });
            setSuccess(true);
            setTimeout(() => setSuccess(false), 3000);
        } catch (err: unknown) {
            setError(err instanceof Error ? err.message : "Failed to save settings.");
        } finally {
            setSaving(false);
        }
    };

    return (
        <form onSubmit={handleSubmit} className="space-y-8">

            {error && (
                <div className="bg-red-50 text-red-700 p-4 rounded-lg text-sm">
                    {error}
                </div>
            )}

            {/* Relationship & Orientation */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">Relationship Status</label>
                    <select
                        value={relationshipStatus}
                        onChange={(e) => setRelationshipStatus(e.target.value)}
                        className="block w-full rounded-md border border-slate-300 px-3 py-2 text-slate-900 focus:border-indigo-600 focus:ring-indigo-600 sm:text-sm"
                    >
                        <option value="">Select...</option>
                        {RELATIONSHIP_STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
                    </select>
                </div>
                <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">Sexual Orientation</label>
                    <select
                        value={sexualOrientation}
                        onChange={(e) => setSexualOrientation(e.target.value)}
                        className="block w-full rounded-md border border-slate-300 px-3 py-2 text-slate-900 focus:border-indigo-600 focus:ring-indigo-600 sm:text-sm"
                    >
                        <option value="">Select...</option>
                        {ORIENTATIONS.map(s => <option key={s} value={s}>{s}</option>)}
                    </select>
                </div>
            </div>

            {/* Looking For */}
            <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">I&apos;m looking for...</label>
                <div className="flex flex-wrap gap-2">
                    {LOOKING_FOR_OPTIONS.map(opt => (
                        <button
                            type="button"
                            key={opt}
                            onClick={() => toggleLookingFor(opt)}
                            className={`px-3 py-1.5 rounded-full text-sm font-medium border transition-colors ${lookingFor.includes(opt)
                                ? "bg-indigo-100 border-indigo-200 text-indigo-700"
                                : "bg-white border-slate-200 text-slate-600 hover:bg-slate-50"
                                }`}
                        >
                            {opt}
                        </button>
                    ))}
                </div>
            </div>

            {/* Lifestyle */}
            <div className="grid grid-cols-3 gap-4">
                <div>
                    <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1">Drinking</label>
                    <select
                        value={drinking}
                        onChange={e => setDrinking(e.target.value)}
                        className="block w-full rounded-md border-slate-300 text-sm py-1.5"
                    >
                        <option value="">-</option>
                        {LIFESTYLE_OPTIONS.drinking.map(o => <option key={o} value={o}>{o}</option>)}
                    </select>
                </div>
                <div>
                    <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1">Smoking</label>
                    <select
                        value={smoking}
                        onChange={e => setSmoking(e.target.value)}
                        className="block w-full rounded-md border-slate-300 text-sm py-1.5"
                    >
                        <option value="">-</option>
                        {LIFESTYLE_OPTIONS.smoking.map(o => <option key={o} value={o}>{o}</option>)}
                    </select>
                </div>
                <div>
                    <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1">Workout</label>
                    <select
                        value={workout}
                        onChange={e => setWorkout(e.target.value)}
                        className="block w-full rounded-md border-slate-300 text-sm py-1.5"
                    >
                        <option value="">-</option>
                        {LIFESTYLE_OPTIONS.workout.map(o => <option key={o} value={o}>{o}</option>)}
                    </select>
                </div>
            </div>

            {/* Prompts */}
            <div className="space-y-4">
                <div className="flex items-center justify-between">
                    <label className="block text-sm font-medium text-slate-700">Discovery Vibe</label>
                    {prompts.length < 3 && (
                        <button type="button" onClick={addPrompt} className="text-sm text-indigo-600 hover:text-indigo-500 font-medium">
                            + Add Prompt
                        </button>
                    )}
                </div>

                {prompts.map((prompt, idx) => (
                    <div key={idx} className="bg-slate-50 p-4 rounded-lg relative group">
                        <div className="mb-2">
                            <select
                                value={prompt.question}
                                onChange={(e) => updatePrompt(idx, 'question', e.target.value)}
                                className="block w-full border-none bg-transparent p-0 text-sm font-medium text-slate-900 focus:ring-0 cursor-pointer"
                            >
                                {VIBE_PROMPTS.map(q => <option key={q} value={q}>{q}</option>)}
                            </select>
                        </div>
                        <textarea
                            value={prompt.answer}
                            onChange={(e) => updatePrompt(idx, 'answer', e.target.value)}
                            placeholder="Your answer..."
                            rows={2}
                            maxLength={150}
                            className="block w-full rounded-md border-0 py-1.5 text-slate-900 shadow-sm ring-1 ring-inset ring-slate-300 placeholder:text-slate-400 focus:ring-2 focus:ring-inset focus:ring-indigo-600 sm:text-sm sm:leading-6 bg-white"
                        />
                        {prompts.length > 1 && (
                            <button
                                type="button"
                                onClick={() => removePrompt(idx)}
                                className="absolute top-2 right-2 text-slate-400 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity"
                            >
                                &times;
                            </button>
                        )}
                    </div>
                ))}
            </div>

            <div className="pt-4 flex items-center gap-4">
                <button
                    type="submit"
                    disabled={saving}
                    className="rounded-lg bg-indigo-600 px-6 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-indigo-700 disabled:opacity-50 flex items-center gap-2"
                >
                    {saving && <Loader2 size={16} className="animate-spin" />}
                    {saving ? "Saving..." : "Save Changes"}
                </button>
                {success && (
                    <span className="text-sm text-emerald-600 font-medium flex items-center gap-1">
                        <Check size={16} /> Saved
                    </span>
                )}
            </div>
        </form>
    );
}
