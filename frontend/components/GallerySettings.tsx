"use client";

import { cn } from "@/lib/utils";
import { Loader2, Trash2, Plus } from "lucide-react";
import Image from "next/image";
import { useState } from "react";
import { ProfileGalleryImage, ProfileRecord } from "@/lib/types";
import { AnimatePresence } from "framer-motion";
import ImageCropper from "./ImageCropper";

type GallerySettingsProps = {
    gallery: ProfileGalleryImage[];
    onGalleryUpload: (file: File) => Promise<ProfileRecord>;
    onGalleryRemove: (key: string) => Promise<ProfileRecord>;
    galleryUploading?: boolean;
    galleryRemovingKey?: string | null;
    galleryError?: string | null;
};

export default function GallerySettings({
    gallery = [],
    onGalleryUpload,
    onGalleryRemove,
    galleryUploading = false,
    galleryRemovingKey = null,
    galleryError = null,
}: GallerySettingsProps) {
    const [cropFile, setCropFile] = useState<File | null>(null);

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
            }
        }
    };

    return (
        <section className="space-y-4">

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
        </section>
    );
}
