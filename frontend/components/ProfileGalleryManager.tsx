"use client";

import Image from "next/image";
import { ChangeEvent, useCallback, useMemo, useRef, useState } from "react";

import type { ProfileGalleryImage, ProfileRecord } from "@/lib/types";

type ProfileGalleryManagerProps = {
	images: ProfileGalleryImage[];
	onUpload: (file: File) => Promise<ProfileRecord>;
	onRemove: (key: string) => Promise<ProfileRecord>;
	uploading?: boolean;
	removingKey?: string | null;
	error?: string | null;
	disabled?: boolean;
	limit?: number;
};

const MAX_FILE_BYTES = 5 * 1024 * 1024;

export default function ProfileGalleryManager({
	images,
	onUpload,
	onRemove,
	uploading = false,
	removingKey = null,
	error = null,
	disabled = false,
	limit,
}: ProfileGalleryManagerProps) {
	const inputRef = useRef<HTMLInputElement | null>(null);
	const [localError, setLocalError] = useState<string | null>(null);

	const remainingSlots = useMemo(() => {
		if (typeof limit !== "number") {
			return null;
		}
		return Math.max(limit - images.length, 0);
	}, [images.length, limit]);

	const busy = uploading || Boolean(removingKey);

	const pickFile = useCallback(() => {
		if (disabled || busy) {
			return;
		}
		inputRef.current?.click();
	}, [busy, disabled]);

	const handleFileChange = useCallback(
		async (event: ChangeEvent<HTMLInputElement>) => {
			const file = event.target.files?.[0] ?? null;
			event.target.value = "";
			if (!file) {
				return;
			}
			if (file.size > MAX_FILE_BYTES) {
				setLocalError("Photos must be under 5MB.");
				return;
			}
			setLocalError(null);
			try {
				await onUpload(file);
			} catch (err) {
				setLocalError(err instanceof Error ? err.message : "Upload failed");
			}
		},
		[onUpload],
	);

	const handleRemove = useCallback(
		async (key: string) => {
			if (busy || disabled) {
				return;
			}
			setLocalError(null);
			try {
				await onRemove(key);
			} catch (err) {
				setLocalError(err instanceof Error ? err.message : "Unable to remove photo");
			}
		},
		[busy, disabled, onRemove],
	);

	const helperText = useMemo(() => {
		if (typeof limit !== "number") {
			return "Add up to 5MB JPEG, PNG, or WebP images.";
		}
		const slots = remainingSlots ?? 0;
		return slots > 0
			? `Add up to ${slots} more photo${slots === 1 ? "" : "s"}.`
			: "Gallery is full. Remove a photo to add a new one.";
	}, [limit, remainingSlots]);

	return (
		<section className="space-y-3 rounded border border-slate-200 bg-white px-4 py-4 text-sm text-slate-700">
			<header className="flex items-center justify-between">
				<div>
					<h3 className="text-sm font-medium text-slate-900">Gallery</h3>
					<p className="text-xs text-slate-500">Show more of your campus story. Photos appear in proximity peeks and invites.</p>
				</div>
				<button
					type="button"
					onClick={pickFile}
					disabled={disabled || busy || (typeof limit === "number" && images.length >= limit)}
					className="rounded-full border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 shadow-sm transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
				>
					{uploading ? "Uploading…" : "Add photo"}
				</button>
			</header>
			{images.length ? (
				<ul className="grid grid-cols-2 gap-3 sm:grid-cols-3">
					{images.map((image) => (
						<li key={image.key} className="group relative overflow-hidden rounded-xl border border-slate-200 bg-slate-50">
							<Image
								src={image.url}
								alt="Profile gallery photo"
								width={240}
								height={240}
								className="h-32 w-full object-cover"
								unoptimized
							/>
							<button
								type="button"
								onClick={() => void handleRemove(image.key)}
								disabled={busy || disabled}
								className="absolute right-2 top-2 rounded-full bg-white/90 px-2 py-1 text-[0.65rem] font-semibold text-rose-600 shadow transition hover:bg-white disabled:cursor-not-allowed disabled:opacity-60"
							>
								{removingKey === image.key ? "Removing…" : "Remove"}
							</button>
						</li>
					))}
				</ul>
			) : (
				<p className="rounded border border-dashed border-slate-200 bg-slate-50 px-3 py-4 text-xs text-slate-500">
					Add a few snapshots so classmates recognise you.
				</p>
			)}
			<p className="text-xs text-slate-500">{helperText}</p>
			{error || localError ? (
				<p className="text-xs text-rose-600">{error ?? localError}</p>
			) : null}
			<input
				type="file"
				accept="image/jpeg,image/png,image/webp"
				ref={inputRef}
				aria-label="Upload gallery photo"
				className="hidden"
				onChange={(event) => void handleFileChange(event)}
				disabled={disabled || busy}
			/>
		</section>
	);
}
