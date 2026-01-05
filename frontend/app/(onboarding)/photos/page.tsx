"use client";

import { useEffect, useState, useRef, useMemo } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { Camera, Plus, Trash2, Loader2, CheckCircle2 } from "lucide-react";
import { AnimatePresence, motion } from "framer-motion";

import {
	fetchProfile,
	presignAvatar,
	commitAvatar,
	presignGallery,
	commitGallery,
	removeGalleryImage,
	reorderPhotos
} from "@/lib/identity";
import { readAuthSnapshot } from "@/lib/auth-storage";
import { ProfileRecord } from "@/lib/types";
import ImageCropper from "@/components/ImageCropper";
import { cn } from "@/lib/utils";

export default function PhotosPage() {
	const router = useRouter();
	const [profile, setProfile] = useState<ProfileRecord | null>(null);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState<string | null>(null);

	// Upload state
	const [uploadingIndex, setUploadingIndex] = useState<number | null>(null);
	const [removingKey, setRemovingKey] = useState<string | null>(null);
	const [cropTarget, setCropTarget] = useState<{ index: number; file: File } | null>(null);

	const fileInputRef = useRef<HTMLInputElement>(null);

	useEffect(() => {
		const load = async () => {
			try {
				const auth = readAuthSnapshot();
				if (!auth?.user_id) {
					router.replace("/login");
					return;
				}
				const data = await fetchProfile(auth.user_id, null);
				setProfile(data);
			} catch (err) {
				console.error("Failed to load profile", err);
				setError("Unable to load your profile. Please try again.");
			} finally {
				setLoading(false);
			}
		};
		void load();
	}, [router]);

	const handleSlotClick = (index: number) => {
		if (uploadingIndex !== null) return;
		setUploadingIndex(index);
		fileInputRef.current?.click();
	};

	const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
		const file = e.target.files?.[0];
		if (file && uploadingIndex !== null) {
			setCropTarget({ index: uploadingIndex, file });
		} else {
			setUploadingIndex(null);
		}
		// Reset input
		e.target.value = "";
	};

	const handleCropCancel = () => {
		setCropTarget(null);
		setUploadingIndex(null);
	};

	const handleCropConfirm = async (blob: Blob) => {
		if (!cropTarget || !profile) return;
		const { index } = cropTarget;
		setCropTarget(null);
		// keep uploadingIndex set for the spinner

		try {
			const auth = readAuthSnapshot();
			if (!auth?.user_id) return;

			const isAvatar = index === 0;
			const presignFn = isAvatar ? presignAvatar : presignGallery;
			const commitFn = isAvatar ? commitAvatar : commitGallery;

			// 1. Presign
			const presigned = await presignFn(auth.user_id, profile.campus_id || null, {
				mime: "image/jpeg",
				bytes: blob.size,
			});

			// 2. Upload
			await fetch(presigned.url, {
				method: "PUT",
				headers: { "Content-Type": "image/jpeg" },
				body: blob,
			});

			// 3. Commit
			const key = presigned.key;
			const updatedProfile = await commitFn(auth.user_id, profile.campus_id || null, key);

			setProfile(updatedProfile);
		} catch (err) {
			console.error("Upload failed", err);
			setError("Failed to upload photo. Please try again.");
		} finally {
			setUploadingIndex(null);
		}
	};

	const handleRemove = async (index: number, key: string) => {
		if (!profile) return;
		setRemovingKey(key);
		try {
			const auth = readAuthSnapshot();
			if (!auth?.user_id) return;

			// If it's the avatar, we just need to know if there's a gallery image to promote?
			// For now, let's keep it simple: if avatar is removed, it's just gone (but usually avatar is required).
			// The current UI doesn't have a remove button for avatar, only "Change".
			if (index > 0) {
				const updatedProfile = await removeGalleryImage(auth.user_id, profile.campus_id || null, key);
				setProfile(updatedProfile);
			}
		} catch (err) {
			console.error("Remove failed", err);
		} finally {
			setRemovingKey(null);
		}
	};

	const onDragEnd = async (fromIndex: number, toIndex: number) => {
		if (!profile || fromIndex === toIndex) return;

		// Get current slots
		const currentSlots = [
			{ url: profile.avatar_url, key: profile.avatar_key },
			...(profile.gallery || []).map(g => ({ url: g.url, key: g.key }))
		].filter(s => s.url && s.key) as { url: string, key: string }[];

		if (fromIndex >= currentSlots.length || toIndex >= currentSlots.length) return;

		const nextSlots = [...currentSlots];
		const [moved] = nextSlots.splice(fromIndex, 1);
		nextSlots.splice(toIndex, 0, moved);

		const auth = readAuthSnapshot();
		if (!auth?.user_id) return;

		try {
			// Optimistic update
			const keys = nextSlots.map(s => s.key);
			const updatedProfile = await reorderPhotos(auth.user_id, profile.campus_id || null, keys);
			setProfile(updatedProfile);
		} catch (err) {
			console.error("Reorder failed", err);
			setError("Failed to rearrange photos.");
		}
	};

	const canContinue = useMemo(() => Boolean(profile?.avatar_url), [profile]);

	if (loading) {
		return (
			<div className="flex min-h-[60vh] flex-col items-center justify-center space-y-4">
				<Loader2 className="h-8 w-8 animate-spin text-indigo-600" />
				<p className="text-sm font-medium text-slate-500">Preparing your studio...</p>
			</div>
		);
	}

	// Map 5 slots: index 0 = avatar, index 1-4 = gallery
	const slots = [
		{ type: "avatar", data: profile?.avatar_url ? { url: profile.avatar_url, key: profile.avatar_key || "" } : null },
		{ type: "gallery", data: profile?.gallery?.[0] || null },
		{ type: "gallery", data: profile?.gallery?.[1] || null },
		{ type: "gallery", data: profile?.gallery?.[2] || null },
		{ type: "gallery", data: profile?.gallery?.[3] || null },
	];

	return (
		<div className="mx-auto w-full max-w-2xl px-4">
			<header className="mb-10 text-center">
				<motion.h1
					initial={{ opacity: 0, y: -10 }}
					animate={{ opacity: 1, y: 0 }}
					className="text-4xl font-extrabold tracking-tight text-slate-900"
				>
					Show Off Your Style
				</motion.h1>
				<motion.p
					initial={{ opacity: 0, y: 10 }}
					animate={{ opacity: 1, y: 0 }}
					transition={{ delay: 0.1 }}
					className="mt-3 text-lg text-slate-600"
				>
					Add up to 5 photos to make your profile stand out.
				</motion.p>
			</header>

			{error && (
				<div className="mb-6 rounded-xl bg-red-50 p-4 text-sm font-medium text-red-800 border border-red-100 flex items-center gap-3">
					<span className="flex h-5 w-5 items-center justify-center rounded-full bg-red-200 text-red-700 text-xs text-center font-bold">!</span>
					{error}
				</div>
			)}

			<div className="grid grid-cols-2 md:grid-cols-3 gap-4 mb-10">
				{slots.map((slot, index) => (
					<motion.div
						key={slot.data?.key || `empty-${index}`}
						layout
						layoutId={slot.data?.key}
						drag={!!slot.data}
						dragSnapToOrigin
						onDragEnd={(_, info) => {
							// Determine which slot we are over
							// This is a simplified hit-test. 
							// For 5 slots in this specific grid, we can estimate by position or use a better approach.
							// Here we'll use a simpler approach: swap with whatever is closest.
							const x = info.point.x;
							const y = info.point.y;

							// Find the element at this point
							const elements = document.elementsFromPoint(x, y);
							const slotElement = elements.find(el => el.hasAttribute('data-slot-index'));
							if (slotElement) {
								const targetIndex = parseInt(slotElement.getAttribute('data-slot-index') || "-1");
								if (targetIndex !== -1 && targetIndex !== index && slots[targetIndex].data) {
									onDragEnd(index, targetIndex);
								}
							}
						}}
						data-slot-index={index}
						className={cn(
							"relative rounded-2xl overflow-hidden transition-all duration-300 group",
							index === 0 ? "col-span-2 md:row-span-2 aspect-square rounded-3xl" : "aspect-square",
							slot.data
								? "bg-white ring-1 ring-slate-200 cursor-grab active:cursor-grabbing z-0 hover:z-10 shadow-sm"
								: "bg-slate-50 border-2 border-dashed border-slate-200"
						)}
					>
						{slot.data ? (
							<>
								<Image
									src={slot.data.url}
									alt={index === 0 ? "Profile" : `Gallery ${index}`}
									fill
									className="object-cover pointer-events-none"
									unoptimized
								/>
								<div className="absolute inset-0 bg-black/0 hover:bg-black/5 transition-colors pointer-events-none" />

								{index === 0 && (
									<div className="absolute top-4 left-4 inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-indigo-600 text-white text-xs font-bold shadow-lg pointer-events-none">
										<Camera size={12} /> Main
									</div>
								)}

								<div className="absolute top-2 right-2 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
									{index > 0 && (
										<button
											onClick={(e) => {
												e.stopPropagation();
												handleRemove(index, slot.data!.key);
											}}
											className="p-1.5 bg-white/90 text-slate-500 rounded-lg hover:text-red-600 hover:bg-white shadow-sm transition-all"
											disabled={!!removingKey}
										>
											{removingKey === slot.data.key ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}
										</button>
									)}
								</div>

								<div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/60 to-transparent p-4 opacity-0 group-hover:opacity-100 transition-opacity flex justify-center">
									<button
										onClick={(e) => {
											e.stopPropagation();
											handleSlotClick(index);
										}}
										className="px-4 py-1.5 bg-white/20 backdrop-blur-md border border-white/30 rounded-lg text-white text-xs font-bold hover:bg-white/30 transition-colors"
									>
										Change
									</button>
								</div>
							</>
						) : (
							<button
								onClick={() => handleSlotClick(index)}
								className="absolute inset-0 flex flex-col items-center justify-center gap-2 text-slate-400 hover:text-indigo-600 transition-colors"
							>
								<div className={cn("rounded-full bg-slate-100 flex items-center justify-center", index === 0 ? "h-16 w-16" : "h-10 w-10")}>
									<Plus size={index === 0 ? 32 : 20} />
								</div>
								<span className={cn("font-bold", index === 0 ? "text-base" : "text-xs uppercase tracking-wider")}>
									{index === 0 ? "Add Profile Photo" : "Add photo"}
								</span>
							</button>
						)}

						{uploadingIndex === index && (
							<div className="absolute inset-0 bg-white/60 backdrop-blur-sm flex items-center justify-center z-20">
								<Loader2 className={cn("animate-spin text-indigo-600", index === 0 ? "h-10 w-10" : "h-6 w-6")} />
							</div>
						)}
					</motion.div>
				))}
			</div>

			<footer className="flex flex-col items-center space-y-6">
				<div className="flex items-center justify-between w-full">
					<button
						onClick={() => router.push("/passions")}
						className="text-sm font-semibold text-slate-500 hover:text-slate-800 transition-colors"
					>
						Back
					</button>

					<div className="flex items-center gap-4">
						<button
							onClick={() => router.push("/vibes")}
							className="text-sm font-semibold text-slate-400 hover:text-slate-600"
						>
							Skip for now
						</button>
						<button
							onClick={() => router.push("/vibes")}
							disabled={!canContinue}
							className={cn(
								"px-8 py-3 rounded-2xl font-bold text-white shadow-xl flex items-center gap-2 transition-all duration-300",
								canContinue
									? "bg-indigo-600 hover:bg-indigo-700 shadow-indigo-200 active:scale-95"
									: "bg-slate-300 cursor-not-allowed"
							)}
						>
							Continue {canContinue && <CheckCircle2 size={18} />}
						</button>
					</div>
				</div>
			</footer>

			{/* Hidden Input for File Selection */}
			<input
				type="file"
				ref={fileInputRef}
				onChange={handleFileChange}
				className="hidden"
				accept="image/jpeg,image/png,image/webp"
			/>

			{/* Image Cropper Modal */}
			<AnimatePresence>
				{cropTarget && (
					<ImageCropper
						file={cropTarget.file}
						onCancel={handleCropCancel}
						onCrop={handleCropConfirm}
						aspectRatio={1} // Square for all photos in onboarding for simplicity
					/>
				)}
			</AnimatePresence>
		</div>
	);
}
