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
	removeGalleryImage
} from "@/lib/identity";
import { readAuthSnapshot } from "@/lib/auth-storage";
import { ProfileGalleryImage, ProfileRecord } from "@/lib/types";
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
			const key = presigned.key || (presigned as any).fields?.key;
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

			// For now, we only support removing from gallery. 
			// Avatar (index 0) change is handled by simply uploading a new one.
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
				{/* Slot 0: Big Avatar Slot */}
				<div className="col-span-2 md:row-span-2 aspect-square relative rounded-3xl overflow-hidden bg-slate-100 border-2 border-dashed border-slate-300 group hover:border-indigo-400 transition-all duration-300">
					{slots[0].data ? (
						<>
							<Image
								src={slots[0].data.url}
								alt="Profile"
								fill
								className="object-cover"
								unoptimized
							/>
							<div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/60 to-transparent p-4 opacity-0 group-hover:opacity-100 transition-opacity">
								<button
									onClick={() => handleSlotClick(0)}
									className="w-full py-2 bg-white/20 backdrop-blur-md border border-white/30 rounded-xl text-white text-sm font-bold hover:bg-white/30 transition-colors"
								>
									Change Main Photo
								</button>
							</div>
							<div className="absolute top-4 left-4 inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-indigo-600 text-white text-xs font-bold shadow-lg">
								<Camera size={12} /> Main
							</div>
						</>
					) : (
						<button
							onClick={() => handleSlotClick(0)}
							className="absolute inset-0 flex flex-col items-center justify-center gap-3 text-slate-400 hover:text-indigo-600 transition-colors"
						>
							<div className="h-16 w-16 rounded-full bg-slate-200 flex items-center justify-center">
								<Plus size={32} />
							</div>
							<span className="font-bold">Add Profile Photo</span>
						</button>
					)}
					{uploadingIndex === 0 && (
						<div className="absolute inset-0 bg-white/60 backdrop-blur-sm flex items-center justify-center z-10">
							<Loader2 className="h-10 w-10 animate-spin text-indigo-600" />
						</div>
					)}
				</div>

				{/* Slots 1-4: Gallery Slots */}
				{slots.slice(1).map((slot, i) => {
					const index = i + 1;
					return (
						<div
							key={index}
							className="aspect-square relative rounded-2xl overflow-hidden bg-slate-50 border border-slate-200 group hover:border-indigo-400 transition-all duration-300"
						>
							{slot.data ? (
								<>
									<Image
										src={slot.data.url}
										alt={`Gallery ${index}`}
										fill
										className="object-cover"
										unoptimized
									/>
									<button
										onClick={() => handleRemove(index, slot.data!.key)}
										className="absolute top-2 right-2 p-1.5 bg-white/90 text-slate-500 rounded-lg opacity-0 group-hover:opacity-100 transition-opacity hover:text-red-600 hover:bg-white shadow-sm"
										disabled={!!removingKey}
									>
										{removingKey === slot.data.key ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}
									</button>
								</>
							) : (
								<button
									onClick={() => handleSlotClick(index)}
									className="absolute inset-0 flex flex-col items-center justify-center gap-2 text-slate-400 hover:text-indigo-600 transition-colors"
								>
									<div className="h-10 w-10 rounded-full bg-slate-100 flex items-center justify-center">
										<Plus size={20} />
									</div>
									<span className="text-xs font-bold uppercase tracking-wider">Add photo</span>
								</button>
							)}
							{uploadingIndex === index && (
								<div className="absolute inset-0 bg-white/60 backdrop-blur-sm flex items-center justify-center z-10">
									<Loader2 className="h-6 w-6 animate-spin text-indigo-600" />
								</div>
							)}
						</div>
					);
				})}
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
