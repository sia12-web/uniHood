"use client";

import { useEffect, useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import { fetchProfile, patchProfile } from "@/lib/identity";
import { readAuthSnapshot } from "@/lib/auth-storage";
import { CheckCircle2, Circle, Trophy, User, Sparkles, Heart, Activity, Quote, ChevronRight, X, Languages as LangIcon } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { cn } from "@/lib/utils";

const GENDERS = ["Male", "Female", "Non-binary", "Prefer not to say"];
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
    "One thing you should know...",
];
const POPULAR_LANGUAGES = [
    "English", "Spanish", "French", "German", "Mandarin", "Hindi", "Arabic",
    "Portuguese", "Bengali", "Russian", "Japanese", "Punjabi", "Marathi",
    "Telugu", "Turkish", "Tamil", "Vietnamese", "Korean", "Italian", "Thai"
].sort();

export default function VibesPage() {
    const router = useRouter();
    const [loading, setLoading] = useState(true);
    const [submitting, setSubmitting] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [campusId, setCampusId] = useState<string | null>(null);

    // --- State ---

    // Basics (from personal)
    const [gender, setGender] = useState("");
    const [birthday, setBirthday] = useState("");
    const [hometown, setHometown] = useState("");
    const [height, setHeight] = useState("");
    const [languages, setLanguages] = useState<string[]>([]);

    const [bio, setBio] = useState("");

    // Identity (from vibes)
    const [relationshipStatus, setRelationshipStatus] = useState("");
    const [sexualOrientation, setSexualOrientation] = useState("");
    const [lookingFor, setLookingFor] = useState<string[]>([]);

    // Lifestyle
    const [drinking, setDrinking] = useState("");
    const [smoking, setSmoking] = useState("");
    const [workout, setWorkout] = useState("");

    // Prompts
    const [prompts, setPrompts] = useState<{ question: string; answer: string }[]>([
        { question: VIBE_PROMPTS[0], answer: "" },
    ]);

    useEffect(() => {
        const load = async () => {
            try {
                const auth = readAuthSnapshot();
                if (!auth?.user_id) {
                    router.replace("/login");
                    return;
                }
                const profile = await fetchProfile(auth.user_id, null);
                setCampusId(profile.campus_id ?? null);

                // Personal
                if (profile.gender) setGender(profile.gender === "None" ? "" : profile.gender);
                if (profile.birthday) setBirthday(new Date(profile.birthday).toISOString().split('T')[0]);
                if (profile.hometown) setHometown(profile.hometown === "None" ? "" : profile.hometown);
                if (profile.height) setHeight(String(profile.height));
                if (profile.languages) {
                    setLanguages(profile.languages.filter(l => l !== "None"));
                }
                if (profile.bio) setBio(profile.bio === "None" ? "" : profile.bio);

                // Vibes
                if (profile.relationship_status) setRelationshipStatus(profile.relationship_status);
                if (profile.sexual_orientation) setSexualOrientation(profile.sexual_orientation);
                if (profile.looking_for) setLookingFor(profile.looking_for);

                if (profile.lifestyle) {
                    const lifestyle = profile.lifestyle as Record<string, string>;
                    setDrinking(lifestyle.drinking || "");
                    setSmoking(lifestyle.smoking || "");
                    setWorkout(lifestyle.workout || "");
                }

                if (profile.profile_prompts && profile.profile_prompts.length > 0) {
                    setPrompts(profile.profile_prompts.map((p) => ({
                        question: p.question || VIBE_PROMPTS[0],
                        answer: p.answer || ""
                    })));
                }

            } catch (err) {
                console.error("Failed to load profile", err);
                setError("Unable to load your profile. Please try again.");
            } finally {
                setLoading(false);
            }
        };
        void load();
    }, [router]);

    // --- Helpers ---

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
            setPrompts([{ question: VIBE_PROMPTS[0], answer: "" }, ...prompts]);
        }
    };

    const removePrompt = (index: number) => {
        setPrompts(prev => prev.filter((_, i) => i !== index));
    };

    // --- Completion Stats ---

    const sections = useMemo(() => {
        const basicsDone = [gender, birthday, hometown, height, languages, bio].filter(Boolean).length;
        const identityDone = [relationshipStatus, sexualOrientation].filter(Boolean).length;
        const goalsDone = lookingFor.length > 0 ? 1 : 0;
        const lifestyleDone = [drinking, smoking, workout].filter(Boolean).length;
        const promptsDone = prompts.filter(p => p.answer.trim().length > 3).length;

        return [
            { id: 'basics', title: 'Basics', icon: User, current: basicsDone, total: 6, color: 'bg-blue-500' },
            { id: 'identity', title: 'Identity', icon: Heart, current: identityDone, total: 2, color: 'bg-rose-500' },
            { id: 'goals', title: 'Interests', icon: Sparkles, current: goalsDone, total: 1, color: 'bg-amber-500' },
            { id: 'lifestyle', title: 'Lifestyle', icon: Activity, current: lifestyleDone, total: 3, color: 'bg-emerald-500' },
            { id: 'prompts', title: 'Prompts', icon: Quote, current: promptsDone, total: 3, color: 'bg-indigo-500' },
        ];
    }, [gender, birthday, hometown, height, languages, bio, relationshipStatus, sexualOrientation, lookingFor, drinking, smoking, workout, prompts]);

    const totalProgress = useMemo(() => {
        const total = sections.reduce((acc, s) => acc + s.total, 0);
        const current = sections.reduce((acc, s) => acc + s.current, 0);
        return Math.min(Math.round((current / total) * 100), 100);
    }, [sections]);

    // --- Actions ---

    const handleSubmit = async (event: React.FormEvent) => {
        event.preventDefault();
        setSubmitting(true);
        setError(null);

        try {
            const auth = readAuthSnapshot();
            if (!auth?.user_id) return;

            await patchProfile(auth.user_id, campusId, {
                // Personal
                bio: bio || undefined,
                gender: gender || null,
                birthday: birthday || null,
                hometown: hometown || null,
                height: height ? parseInt(height) : null,
                languages: languages.length > 0 ? languages : null,
                // Vibes
                relationship_status: relationshipStatus || null,
                sexual_orientation: sexualOrientation || null,
                looking_for: lookingFor.length > 0 ? lookingFor : null,
                lifestyle: {
                    drinking: drinking || "",
                    smoking: smoking || "",
                    workout: workout || "",
                },
                profile_prompts: prompts.filter(p => p.answer.trim().length > 0),
            });

            router.push("/vision");
        } catch (err) {
            console.error(err);
            setError("Failed to save your details. Please try again.");
        } finally {
            setSubmitting(false);
        }
    };

    if (loading) {
        return (
            <div className="flex min-h-[60vh] flex-col items-center justify-center space-y-4">
                <div className="relative">
                    <div className="h-16 w-16 rounded-full border-4 border-slate-100 border-t-indigo-600 animate-spin" />
                    <Sparkles className="absolute inset-0 m-auto h-6 w-6 text-indigo-400 animate-pulse" />
                </div>
                <p className="text-sm font-medium text-slate-500">Curating your vibe...</p>
            </div>
        );
    }

    return (
        <div className="mx-auto w-full px-4 sm:px-6">
            <header className="mb-8 text-center pt-4">
                <div className="mb-4 inline-flex items-center gap-2 rounded-full bg-indigo-50 px-4 py-1.5 text-xs font-bold uppercase tracking-wider text-indigo-700 shadow-sm ring-1 ring-inset ring-indigo-200">
                    <Sparkles className="h-3 w-3" /> Step 6: Polish
                </div>
                <h1 className="text-3xl font-black tracking-tight text-slate-900 md:text-4xl">
                    One Last <span className="text-indigo-600">Check</span>
                </h1>
                <p className="mt-2 text-base text-slate-600">
                    Complete your profile to find better matches.
                </p>
            </header>

            {/* Global Progress Bar */}
            <div className="mb-10 p-6 rounded-2xl bg-indigo-50/50 border border-indigo-100">
                <div className="mb-4 flex items-center justify-between">
                    <div className="flex items-center gap-2">
                        <Trophy className="h-5 w-5 text-amber-500" />
                        <span className="font-bold text-slate-900">Completion Status</span>
                    </div>
                    <span className="text-xl font-black text-indigo-600">{totalProgress}%</span>
                </div>
                <div className="h-3 w-full overflow-hidden rounded-full bg-slate-200/50">
                    <motion.div
                        initial={{ width: 0 }}
                        animate={{ width: `${totalProgress}%` }}
                        className="h-full bg-gradient-to-r from-indigo-500 to-indigo-700"
                    />
                </div>
                <div className="mt-4 flex flex-wrap justify-between gap-2">
                    {sections.map((section) => (
                        <div key={section.id} className="flex flex-col items-center gap-1">
                            <div className={cn(
                                "flex h-6 w-6 items-center justify-center rounded-full transition-all duration-300",
                                section.current === section.total
                                    ? "bg-emerald-100 text-emerald-600"
                                    : "bg-slate-100 text-slate-400"
                            )}>
                                {section.current === section.total ? <CheckCircle2 className="h-3.5 w-3.5" /> : <section.icon className="h-3.5 w-3.5" />}
                            </div>
                            <span className="text-[9px] font-bold uppercase tracking-wider text-slate-500">{section.title}</span>
                        </div>
                    ))}
                </div>
            </div>

            <form onSubmit={handleSubmit} className="space-y-10">
                {error && (
                    <div className="mb-6 rounded-2xl bg-red-50 p-4 text-sm font-medium text-red-800 border border-red-100 flex items-center gap-3">
                        <Circle className="h-2 w-2 fill-current" /> {error}
                    </div>
                )}

                {/* --- Section: Basics --- */}
                <div className="border-b border-slate-100 pb-10">
                    <div className="mb-6 flex items-center gap-3">
                        <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-blue-50 text-blue-600">
                            <User className="h-5 w-5" />
                        </div>
                        <h2 className="text-xl font-bold text-slate-900">Basics</h2>
                    </div>

                    <div className="space-y-6">
                        <div>
                            <label className="block text-sm font-semibold text-slate-700 mb-2">Bio</label>
                            <textarea
                                value={bio}
                                onChange={(e) => setBio(e.target.value)}
                                placeholder="Tell everyone a bit about yourself..."
                                maxLength={160}
                                rows={3}
                                className="block w-full rounded-xl border-slate-200 bg-slate-50 px-4 py-3 text-slate-900 focus:border-indigo-600 focus:ring-indigo-600 transition-all sm:text-sm"
                            />
                            <div className="mt-1 text-right text-xs text-slate-400">
                                {bio.length}/160
                            </div>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                            <div>
                                <label className="block text-sm font-semibold text-slate-700 mb-2">Gender</label>
                                <select
                                    value={gender}
                                    onChange={(e) => setGender(e.target.value)}
                                    className="block w-full rounded-xl border-slate-200 bg-slate-50 px-4 py-3 text-slate-900 focus:border-indigo-600 focus:ring-indigo-600 transition-all sm:text-sm"
                                >
                                    <option value="" disabled hidden>Select your gender</option>
                                    {GENDERS.map((g) => <option key={g} value={g}>{g}</option>)}
                                </select>
                            </div>
                            <div>
                                <label className="block text-sm font-semibold text-slate-700 mb-2">Birthday</label>
                                <input
                                    type="date"
                                    value={birthday}
                                    onChange={(e) => setBirthday(e.target.value)}
                                    className="block w-full rounded-xl border-slate-200 bg-slate-50 px-4 py-3 text-slate-900 focus:border-indigo-600 focus:ring-indigo-600 transition-all sm:text-sm"
                                />
                            </div>
                            <div>
                                <label className="block text-sm font-semibold text-slate-700 mb-2">Hometown</label>
                                <input
                                    type="text"
                                    value={hometown}
                                    onChange={(e) => setHometown(e.target.value)}
                                    placeholder="Where are you from?"
                                    className="block w-full rounded-xl border-slate-200 bg-slate-50 px-4 py-3 text-slate-900 focus:border-indigo-600 focus:ring-indigo-600 transition-all sm:text-sm"
                                />
                            </div>
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-sm font-semibold text-slate-700 mb-2">Height (cm)</label>
                                    <input
                                        type="number"
                                        value={height}
                                        onChange={(e) => setHeight(e.target.value)}
                                        placeholder="e.g. 175"
                                        className="block w-full rounded-xl border-slate-200 bg-slate-50 px-4 py-3 text-slate-900 focus:border-indigo-600 focus:ring-indigo-600 transition-all sm:text-sm"
                                    />
                                </div>
                            </div>
                            <div className="md:col-span-2">
                                <label className="block text-sm font-semibold text-slate-700 mb-2">Languages</label>
                                <div className="space-y-3">
                                    <div className="flex flex-wrap gap-2 p-3 rounded-xl border border-slate-200 bg-slate-50 min-h-[56px] focus-within:ring-2 focus-within:ring-indigo-600/20 focus-within:border-indigo-600 transition-all">
                                        <AnimatePresence>
                                            {languages.map((lang) => (
                                                <motion.span
                                                    key={lang}
                                                    initial={{ opacity: 0, scale: 0.8 }}
                                                    animate={{ opacity: 1, scale: 1 }}
                                                    exit={{ opacity: 0, scale: 0.8 }}
                                                    className="inline-flex items-center gap-1.5 bg-indigo-100 text-indigo-700 px-3 py-1 rounded-full text-sm font-medium border border-indigo-200"
                                                >
                                                    {lang}
                                                    <button
                                                        type="button"
                                                        onClick={() => setLanguages(prev => prev.filter(l => l !== lang))}
                                                        className="hover:text-indigo-900 transition-colors"
                                                    >
                                                        <X size={14} />
                                                    </button>
                                                </motion.span>
                                            ))}
                                        </AnimatePresence>
                                        <input
                                            type="text"
                                            placeholder={languages.length === 0 ? "Type a language and press Enter..." : "Add more..."}
                                            className="flex-1 bg-transparent border-none p-0 focus:ring-0 text-sm placeholder:text-slate-400 min-w-[150px]"
                                            onKeyDown={(e) => {
                                                if (e.key === 'Enter' || e.key === ',') {
                                                    e.preventDefault();
                                                    const val = e.currentTarget.value.trim().replace(/,$/, '');
                                                    if (val && !languages.includes(val)) {
                                                        setLanguages(prev => [...prev, val]);
                                                        e.currentTarget.value = '';
                                                    }
                                                }
                                            }}
                                        />
                                    </div>
                                    <div className="flex flex-wrap gap-1.5">
                                        <span className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mr-1 flex items-center">
                                            <LangIcon size={12} className="mr-1" /> Quick Add:
                                        </span>
                                        {POPULAR_LANGUAGES.filter(l => !languages.includes(l)).slice(0, 8).map(lang => (
                                            <button
                                                key={lang}
                                                type="button"
                                                onClick={() => setLanguages(prev => [...prev, lang])}
                                                className="text-[11px] font-semibold text-slate-500 bg-white border border-slate-200 px-2.5 py-1 rounded-lg hover:border-indigo-400 hover:text-indigo-600 transition-all shadow-sm"
                                            >
                                                + {lang}
                                            </button>
                                        ))}
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>

                {/* --- Section: Identity & Hearts --- */}
                <div className="border-b border-slate-100 pb-10">
                    <div className="mb-6 flex items-center gap-3">
                        <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-rose-50 text-rose-600">
                            <Heart className="h-5 w-5" />
                        </div>
                        <h2 className="text-xl font-bold text-slate-900">Identity & Dating</h2>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
                        <div>
                            <label className="block text-sm font-semibold text-slate-700 mb-2">Relationship Status</label>
                            <select
                                value={relationshipStatus}
                                onChange={e => setRelationshipStatus(e.target.value)}
                                className="block w-full rounded-xl border-slate-200 bg-slate-50 px-4 py-3 text-slate-900 focus:border-indigo-600 focus:ring-indigo-600 transition-all sm:text-sm"
                            >
                                <option value="" disabled hidden>Select your status</option>
                                {RELATIONSHIP_STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
                            </select>
                        </div>
                        <div>
                            <label className="block text-sm font-semibold text-slate-700 mb-2">Sexual Orientation</label>
                            <select
                                value={sexualOrientation}
                                onChange={e => setSexualOrientation(e.target.value)}
                                className="block w-full rounded-xl border-slate-200 bg-slate-50 px-4 py-3 text-slate-900 focus:border-indigo-600 focus:ring-indigo-600 transition-all sm:text-sm"
                            >
                                <option value="" disabled hidden>Select your orientation</option>
                                {ORIENTATIONS.map(o => <option key={o} value={o}>{o}</option>)}
                            </select>
                        </div>
                    </div>

                    <div className="space-y-4">
                        <label className="block text-sm font-semibold text-slate-700">I am looking for...</label>
                        <div className="flex flex-wrap gap-2">
                            {LOOKING_FOR_OPTIONS.map(opt => (
                                <button
                                    key={opt}
                                    type="button"
                                    onClick={() => toggleLookingFor(opt)}
                                    className={cn(
                                        "px-4 py-2 rounded-full text-sm font-medium transition-all duration-300",
                                        lookingFor.includes(opt)
                                            ? "bg-indigo-600 text-white shadow-md shadow-indigo-200 transform scale-105"
                                            : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                                    )}
                                >
                                    {opt}
                                </button>
                            ))}
                        </div>
                    </div>
                </div>

                {/* --- Section: Lifestyle --- */}
                <div className="border-b border-slate-100 pb-10">
                    <div className="mb-6 flex items-center gap-3">
                        <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-emerald-50 text-emerald-600">
                            <Activity className="h-5 w-5" />
                        </div>
                        <h2 className="text-xl font-bold text-slate-900">Lifestyle</h2>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                        <div>
                            <label className="block text-xs font-bold uppercase tracking-widest text-slate-500 mb-2">Drinking</label>
                            <select
                                value={drinking}
                                onChange={e => setDrinking(e.target.value)}
                                className="block w-full rounded-xl border-slate-200 bg-slate-50 px-4 py-3 text-sm focus:border-indigo-600 focus:ring-indigo-600"
                            >
                                <option value="" disabled hidden>Select</option>
                                {LIFESTYLE_OPTIONS.drinking.map(o => <option key={o} value={o}>{o}</option>)}
                            </select>
                        </div>
                        <div>
                            <label className="block text-xs font-bold uppercase tracking-widest text-slate-500 mb-2">Smoking</label>
                            <select
                                value={smoking}
                                onChange={e => setSmoking(e.target.value)}
                                className="block w-full rounded-xl border-slate-200 bg-slate-50 px-4 py-3 text-sm focus:border-indigo-600 focus:ring-indigo-600"
                            >
                                <option value="" disabled hidden>Select</option>
                                {LIFESTYLE_OPTIONS.smoking.map(o => <option key={o} value={o}>{o}</option>)}
                            </select>
                        </div>
                        <div>
                            <label className="block text-xs font-bold uppercase tracking-widest text-slate-500 mb-2">Workout</label>
                            <select
                                value={workout}
                                onChange={e => setWorkout(e.target.value)}
                                className="block w-full rounded-xl border-slate-200 bg-slate-50 px-4 py-3 text-sm focus:border-indigo-600 focus:ring-indigo-600"
                            >
                                <option value="" disabled hidden>Select</option>
                                {LIFESTYLE_OPTIONS.workout.map(o => <option key={o} value={o}>{o}</option>)}
                            </select>
                        </div>
                    </div>
                </div>

                {/* --- Section: Prompts --- */}
                <div>
                    <div className="mb-6 flex items-center justify-between">
                        <div className="flex items-center gap-3">
                            <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-indigo-50 text-indigo-600">
                                <Quote className="h-5 w-5" />
                            </div>
                            <h2 className="text-xl font-bold text-slate-900">Profile Prompts</h2>
                        </div>
                        {prompts.length < 3 && (
                            <button
                                type="button"
                                onClick={addPrompt}
                                className="flex items-center gap-1.5 text-sm font-bold text-indigo-600 hover:text-indigo-700"
                            >
                                <Sparkles className="h-4 w-4" /> Add One
                            </button>
                        )}
                    </div>

                    <div className="space-y-6">
                        <AnimatePresence initial={false}>
                            {prompts.map((prompt, idx) => (
                                <motion.div
                                    key={`${idx}-${prompt.question}`}
                                    initial={{ opacity: 0, scale: 0.95, y: -20 }}
                                    animate={{ opacity: 1, scale: 1, y: 0 }}
                                    exit={{ opacity: 0, scale: 0.95, y: -20 }}
                                    className="relative group bg-slate-50 p-6 rounded-2xl border border-slate-100 hover:border-indigo-200 transition-colors"
                                >
                                    <div className="mb-3 pr-8">
                                        <select
                                            value={prompt.question}
                                            onChange={(e) => updatePrompt(idx, 'question', e.target.value)}
                                            className="block w-full border-none bg-transparent p-0 text-sm font-bold text-slate-700 focus:ring-0 cursor-pointer sm:text-base"
                                        >
                                            {VIBE_PROMPTS.map(q => <option key={q} value={q}>{q}</option>)}
                                        </select>
                                    </div>
                                    <textarea
                                        value={prompt.answer}
                                        onChange={(e) => updatePrompt(idx, 'answer', e.target.value)}
                                        placeholder="Type your story here..."
                                        rows={3}
                                        maxLength={150}
                                        className="block w-full rounded-xl border-none bg-white p-4 text-slate-900 shadow-sm focus:ring-2 focus:ring-indigo-500/20 placeholder:text-slate-400 sm:text-sm"
                                    />
                                    {prompts.length > 1 && (
                                        <button
                                            type="button"
                                            onClick={() => removePrompt(idx)}
                                            className="absolute top-6 right-6 text-slate-300 hover:text-red-500 transition-colors"
                                        >
                                            &times;
                                        </button>
                                    )}
                                </motion.div>
                            ))}
                        </AnimatePresence>
                    </div>
                </div>

                {/* Footer Actions */}
                <footer className="flex flex-col items-center gap-6 pt-8">
                    <div className="flex w-full items-center justify-between">
                        <button
                            type="button"
                            onClick={() => router.push("/photos")}
                            className="text-sm font-bold text-slate-400 hover:text-slate-900 transition-colors"
                        >
                            Back
                        </button>
                        <button
                            type="submit"
                            disabled={submitting}
                            className="group relative inline-flex items-center gap-2 rounded-2xl bg-indigo-600 px-10 py-4 text-lg font-black text-white shadow-xl shadow-indigo-600/30 transition-all hover:bg-indigo-700 hover:shadow-indigo-600/50 hover:-translate-y-1 active:scale-95 disabled:opacity-50"
                        >
                            {submitting ? "Preserving your vibe..." : (
                                <>
                                    Save & Continue <ChevronRight className="h-5 w-5" />
                                </>
                            )}
                        </button>
                    </div>
                </footer>
            </form>
        </div>
    );
}
