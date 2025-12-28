"use client";

import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";
import { motion, AnimatePresence } from "framer-motion";
import { apiFetch } from "@/app/lib/http/client";
import { DiscoveryProfile, DiscoveryProfileUpdate } from "@/lib/types";
import { Check, Loader2, AlertCircle, Trash2, Plus } from "lucide-react";
import Image from "next/image";
import { readAuthUser } from "@/lib/auth-storage";
import { fetchProfile } from "@/lib/identity";
import { ProfileGalleryImage, ProfileRecord } from "@/lib/types";
import ImageCropper from "./ImageCropper";

type DiscoverySettingsProps = {
    gallery: ProfileGalleryImage[];
    onGalleryUpload: (file: File) => Promise<ProfileRecord>;
    onGalleryRemove: (key: string) => Promise<ProfileRecord>;
    galleryUploading?: boolean;
    galleryRemovingKey?: string | null;
    galleryError?: string | null;
};


export type DiscoveryPrompt = {
    id: string;
    category: string;
    question: string;
    field_key: string;
    type: string;
    options?: string[];
};

export default function DiscoverySettings({
    gallery = [],
    onGalleryUpload,
    onGalleryRemove,
    galleryUploading = false,
    galleryRemovingKey = null,
    galleryError = null,
}: DiscoverySettingsProps) {
    const [cropFile, setCropFile] = useState<File | null>(null);
    const [prompts, setPrompts] = useState<DiscoveryPrompt[]>([]);
    const [answers, setAnswers] = useState<Record<string, unknown>>({});
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [saveSuccess, setSaveSuccess] = useState(false);

    useEffect(() => {
        setLoading(true);
        const user = readAuthUser();
        Promise.all([
            apiFetch<DiscoveryPrompt[]>("/discovery/prompts"),
            apiFetch<DiscoveryProfile>("/discovery/profile"),
            user ? fetchProfile(user.userId, user.campusId ?? null) : Promise.resolve(null)
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
        const update: Record<string, Record<string, unknown>> = {};
        prompts.forEach(p => {
            const val = nextAnswers[p.field_key];
            if (val) {
                if (!update[p.category]) update[p.category] = {};
                update[p.category][p.field_key] = val;
            }
        });

        try {
            await apiFetch("/discovery/profile", {
                method: "PUT",
                body: update as DiscoveryProfileUpdate
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


    const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files && e.target.files[0]) {
            setCropFile(e.target.files[0]);
            e.target.value = ""; // reset
        }
    };

    const handleCropSave = async (blob: Blob) => {
        setCropFile(null);
        if (onGalleryUpload) {
            const file = new File([blob], "profile-photo.jpg", { type: "image/jpeg" });
            try {
                await onGalleryUpload(file);
            } catch (err) {
                console.error(err);
                // Parent handles error state usually
            }
        }
    };

    // Calculate completion
    const totalPrompts = prompts.length + 6; // +6 for Gallery (each photo counts)
    const answeredCount = prompts.filter(p => {
        const val = answers[p.field_key];
        return val !== undefined && val !== null && String(val).trim().length > 0;
    }).length + Math.min(gallery.length, 6);

    const progress = totalPrompts > 0 ? (answeredCount / totalPrompts) * 100 : 0;
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

            {/* Progress & Status Card */}
            <div className="rounded border border-slate-200 bg-white p-6">
                <div className="flex items-center justify-between mb-6">
                    <div>
                        <h2 className="text-lg font-semibold text-slate-900">Discovery Vibe Completion</h2>
                        <p className="text-sm text-slate-500 mt-1">
                            Upload photos and answer prompts to reach 100% and boost your visibility.
                        </p>
                    </div>
                    <div className="flex items-center gap-2">
                        <span className="text-2xl font-bold text-slate-900">{Math.round(progress)}%</span>
                        {progress >= 100 && <Check className="text-emerald-500" size={24} />}
                    </div>
                </div>

                <div className="h-2 w-full bg-slate-100 rounded-full overflow-hidden mb-4">
                    <motion.div
                        className="h-full bg-indigo-600"
                        initial={{ width: 0 }}
                        animate={{ width: `${progress}%` }}
                        transition={{ duration: 1, ease: "easeOut" }}
                    />
                </div>

                <p className="text-xs text-slate-500">
                    {progress >= 100
                        ? "Your profile is fully optimized for discovery."
                        : `Add more details to boost your visibility by +${percentPerItem}% per item.`}
                </p>
            </div>

            {/* Gallery Section */}
            <div className="rounded border border-slate-200 bg-white p-6 space-y-4">
                <div className="flex items-center justify-between">
                    <div>
                        <h3 className="text-base font-semibold text-slate-900">Photo Gallery</h3>
                        <p className="text-sm text-slate-500 mt-1">Upload 6 photos for a complete profile ({gallery.length}/6).</p>
                    </div>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-3">
                    {Array.from({ length: 6 }).map((_, index) => {
                        const img = gallery[index];
                        return (
                            <div key={index} className="relative aspect-[3/4] rounded-lg overflow-hidden bg-slate-50 border border-slate-200 group transition-all hover:border-indigo-400">
                                {img ? (
                                    <>
                                        <Image
                                            src={img.url}
                                            alt={`Gallery ${index + 1}`}
                                            fill
                                            className="object-cover"
                                            unoptimized
                                        />
                                        <button
                                            onClick={() => onGalleryRemove?.(img.key)}
                                            disabled={galleryUploading || !!galleryRemovingKey}
                                            className="absolute top-1 right-1 p-1 bg-white/90 text-slate-600 rounded-full opacity-0 group-hover:opacity-100 transition hover:text-rose-600 shadow-sm"
                                        >
                                            <Trash2 size={12} />
                                        </button>
                                        {galleryRemovingKey === img.key && (
                                            <div className="absolute inset-0 bg-white/80 flex items-center justify-center z-20">
                                                <Loader2 className="animate-spin text-slate-400" size={16} />
                                            </div>
                                        )}
                                        <div className="absolute bottom-1 right-1 bg-black/50 text-white text-[9px] font-bold px-1.5 py-0.5 rounded backdrop-blur-sm pointer-events-none">
                                            {index + 1}
                                        </div>
                                    </>
                                ) : (
                                    <label className={cn(
                                        "absolute inset-0 flex flex-col items-center justify-center gap-2 cursor-pointer text-slate-400 hover:text-indigo-600 hover:bg-indigo-50/30 transition",
                                        (galleryUploading) && "opacity-50 pointer-events-none"
                                    )}>
                                        <input
                                            type="file"
                                            accept="image/jpeg,image/png,image/webp"
                                            className="hidden"
                                            onChange={handleFileSelect}
                                            disabled={galleryUploading}
                                        />
                                        {galleryUploading && gallery.length === index ? (
                                            <Loader2 className="animate-spin" size={20} />
                                        ) : (
                                            <Plus size={20} className="text-slate-300 group-hover:text-indigo-500 transition" />
                                        )}
                                    </label>
                                )}
                            </div>
                        );
                    })}
                </div>
                {galleryError && (
                    <p className="text-xs text-rose-600 font-medium">{galleryError}</p>
                )}
            </div>

            {/* Categories */}
            <div className="space-y-6">
                {categories.map(category => (
                    <div key={category} className="rounded border border-slate-200 bg-white p-6 space-y-6">
                        <div className="flex items-center gap-3 pb-4 border-b border-slate-100">
                            <h3 className="text-base font-semibold capitalize text-slate-900">
                                {category.replace(/_/g, ' ')}
                            </h3>
                            {prompts.filter(p => p.category === category).every(p => {
                                const val = answers[p.field_key];
                                return val !== undefined && val !== null && String(val).length > 0;
                            }) && (
                                    <span className="text-xs bg-emerald-50 text-emerald-700 font-medium px-2 py-0.5 rounded-full flex items-center gap-1 border border-emerald-100">
                                        <Check size={10} strokeWidth={3} /> Complete
                                    </span>
                                )}
                        </div>

                        <div className="grid gap-6 md:grid-cols-2">
                            {prompts.filter(p => p.category === category).map(p => {
                                const val = answers[p.field_key];
                                const displayValue = (val === undefined || val === null || typeof val === 'object') ? '' : String(val);

                                return (
                                    <div key={p.id} className="space-y-2">
                                        <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider">
                                            {p.question}
                                        </label>

                                        {p.options && p.options.length > 0 ? (
                                            <div className="flex flex-wrap gap-2">
                                                {p.options.map(opt => (
                                                    <button
                                                        key={opt}
                                                        onClick={() => handleSave(p.field_key, opt)}
                                                        className={cn(
                                                            "px-3 py-1.5 rounded-md text-sm font-medium transition-all border",
                                                            displayValue === opt
                                                                ? "bg-slate-900 border-slate-900 text-white"
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
                                                    value={displayValue}
                                                    onChange={(e) => setAnswers(prev => ({ ...prev, [p.field_key]: e.target.value }))}
                                                    onBlur={(e) => handleSave(p.field_key, e.target.value)}
                                                    placeholder="Your answer..."
                                                    className="w-full px-3 py-2 rounded-md border border-slate-300 text-sm bg-white focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 outline-none transition placeholder:text-slate-400"
                                                />
                                                {displayValue && (
                                                    <div className="absolute right-3 top-2.5 text-emerald-500 pointer-events-none">
                                                        <Check size={14} />
                                                    </div>
                                                )}
                                            </div>
                                        )}
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                ))}
            </div>

            {/* Cropper Modal */}
            <AnimatePresence>
                {cropFile && (
                    <ImageCropper
                        file={cropFile}
                        onCancel={() => setCropFile(null)}
                        onCrop={handleCropSave}
                        aspectRatio={3 / 4}
                    />
                )}
            </AnimatePresence>

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
