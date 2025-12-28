"use client";

import Image from "next/image";
import { ChangeEvent, useEffect, useRef, useState } from "react";

import type { ProfileRecord } from "@/lib/types";

type AvatarUploaderProps = {
	avatarUrl?: string | null;
	onUpload: (file: File) => Promise<ProfileRecord>;
	disabled?: boolean;
	onChange?: (profile: ProfileRecord) => void;
};



export default function AvatarUploader({
	avatarUrl,
	onUpload,
	disabled = false,
	onChange,
}: AvatarUploaderProps) {
	const inputRef = useRef<HTMLInputElement | null>(null);
	const [previewUrl, setPreviewUrl] = useState<string | null>(avatarUrl ?? null);
	const [uploading, setUploading] = useState<boolean>(false);
	const [error, setError] = useState<string | null>(null);


	useEffect(() => {
		setPreviewUrl(avatarUrl ?? null);
	}, [avatarUrl]);



	const handlePick = () => {
		if (disabled || uploading) {
			return;
		}
		inputRef.current?.click();
	};



	const handleFileChange = async (event: ChangeEvent<HTMLInputElement>) => {
		const file = event.target.files?.[0];
		if (!file) {
			return;
		}
		if (file.size > 5 * 1024 * 1024) {
			setError("Avatar must be at most 5MB.");
			event.target.value = "";
			return;
		}
		setError(null);
		setUploading(true);
		try {
			const nextProfile = await onUpload(file);
			setPreviewUrl(nextProfile.avatar_url ?? null);
			onChange?.(nextProfile);
		} catch (err) {
			setError(err instanceof Error ? err.message : "Upload failed");
		} finally {
			setUploading(false);
			event.target.value = "";
		}
	};

	return (
		<section className="flex flex-col gap-3">


			<div className="flex items-start gap-5">
				<button
					type="button"
					onClick={handlePick}
					disabled={disabled || uploading}
					className="group relative h-24 w-24 shrink-0 overflow-hidden rounded-full border-2 border-slate-200 bg-slate-50 transition hover:border-slate-300 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2"
					aria-label="Upload photo"
				>
					{previewUrl ? (
						<Image src={previewUrl} alt="Avatar" fill className="object-cover transition group-hover:opacity-75" sizes="96px" />
					) : (
						<div className="flex h-full w-full flex-col items-center justify-center gap-1 text-slate-400">
							<span className="text-2xl">📷</span>
							<span className="text-[10px] font-medium uppercase text-slate-500">Upload</span>
						</div>
					)}
					{uploading && (
						<div className="absolute inset-0 flex items-center justify-center bg-black/30 text-white">
							<div className="h-5 w-5 animate-spin rounded-full border-2 border-white/50 border-t-white" />
						</div>
					)}
				</button>
				<div className="flex flex-col gap-2 pt-2">

					<p className="text-xs text-slate-500">JPEG, PNG, or WebP up to 5MB.</p>
				</div>
			</div>
			{error ? <p className="text-xs text-rose-600">{error}</p> : null}
			<input
				ref={inputRef}
				type="file"
				accept="image/jpeg,image/png,image/webp"
				aria-label="Upload avatar"
				className="hidden"
				onChange={(event) => void handleFileChange(event)}
			/>
		</section>
	);
}
