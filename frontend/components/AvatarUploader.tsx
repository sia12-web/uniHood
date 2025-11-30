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

import AvatarCreator from "./avatar-creator/AvatarCreator";
import { Sparkles } from "lucide-react";
import { AvatarState } from "./avatar-creator/types";

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
	const [showCreator, setShowCreator] = useState(false);
	const [avatarState, setAvatarState] = useState<AvatarState | undefined>(undefined);

	useEffect(() => {
		setPreviewUrl(avatarUrl ?? null);
	}, [avatarUrl]);

	useEffect(() => {
		try {
			const saved = localStorage.getItem("divan.avatar_state");
			if (saved) {
				setAvatarState(JSON.parse(saved));
			}
		} catch {
			// ignore
		}
	}, []);

	const handlePick = () => {
		if (disabled || uploading) {
			return;
		}
		inputRef.current?.click();
	};

	const handleCreatorSave = async (blob: Blob, state: AvatarState) => {
		setShowCreator(false);
		setUploading(true);
		setError(null);

		try {
			localStorage.setItem("divan.avatar_state", JSON.stringify(state));
			setAvatarState(state);

			// Convert blob to File
			const file = new File([blob], "avatar.png", { type: "image/png" });
			const nextProfile = await onUpload(file);
			setPreviewUrl(nextProfile.avatar_url ?? null);
			onChange?.(nextProfile);
		} catch (err) {
			setError(err instanceof Error ? err.message : "Upload failed");
		} finally {
			setUploading(false);
		}
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
			{showCreator && (
				<div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm">
					<div className="w-full max-w-4xl animate-in fade-in zoom-in duration-200">
						<AvatarCreator
							onSave={handleCreatorSave}
							onCancel={() => setShowCreator(false)}
							initialState={avatarState}
							className="max-h-[90vh]"
						/>
					</div>
				</div>
			)}

			<div className="flex items-center gap-4">
				<div className="relative h-20 w-20 overflow-hidden rounded-full border border-slate-200 bg-slate-100">
					{previewUrl ? (
						<Image src={previewUrl} alt="Profile avatar" fill className="object-cover" sizes="80px" />
					) : (
						<div className="flex h-full w-full items-center justify-center text-xs text-slate-500">No avatar</div>
					)}
				</div>
				<div className="flex flex-col gap-2 text-sm">
					<div className="flex gap-2">
						<button
							type="button"
							onClick={handlePick}
							disabled={disabled || uploading}
							className="w-fit rounded bg-white px-3 py-2 font-medium text-slate-900 shadow disabled:opacity-50"
						>
							{uploading ? "Uploading…" : "Upload photo"}
						</button>
						<button
							type="button"
							onClick={() => setShowCreator(true)}
							disabled={disabled || uploading}
							className="flex items-center gap-2 w-fit rounded bg-indigo-50 px-3 py-2 font-medium text-indigo-700 shadow-sm hover:bg-indigo-100 disabled:opacity-50"
						>
							<Sparkles className="h-4 w-4" />
							Create Avatar
						</button>
					</div>
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
