"use client";

import { ChangeEvent, useRef, useState } from "react";

import type { VerificationEntry } from "@/lib/types";

type UploadStudentCardProps = {
	onUpload: (file: File) => Promise<VerificationEntry>;
	onComplete?: (entry: VerificationEntry) => void;
	disabled?: boolean;
};

type UploadStatus = "idle" | "uploading" | "success" | "error";

const MAX_BYTES = 6 * 1024 * 1024;
const ACCEPTED_TYPES = ["image/jpeg", "image/png", "image/webp", "application/pdf"];

export default function UploadStudentCard({ onUpload, onComplete, disabled = false }: UploadStudentCardProps) {
	const inputRef = useRef<HTMLInputElement | null>(null);
	const [status, setStatus] = useState<UploadStatus>("idle");
	const [message, setMessage] = useState<string>("Upload a clear photo of your student ID");
	const [error, setError] = useState<string | null>(null);

	const handleSelect = () => {
		if (disabled || status === "uploading") {
			return;
		}
		inputRef.current?.click();
	};

	const handleFile = async (event: ChangeEvent<HTMLInputElement>) => {
		const file = event.target.files?.[0];
		event.target.value = "";
		if (!file) {
			return;
		}
		if (!ACCEPTED_TYPES.includes(file.type)) {
			setError("Upload a JPG, PNG, WebP, or PDF document.");
			setStatus("error");
			return;
		}
		if (file.size > MAX_BYTES) {
			setError("File must be 6MB or smaller.");
			setStatus("error");
			return;
		}
		setError(null);
		setStatus("uploading");
		setMessage("Uploading…");
		try {
			const entry = await onUpload(file);
			setStatus("success");
			setMessage("Document uploaded. Awaiting moderator review.");
			onComplete?.(entry);
		} catch (err) {
			setStatus("error");
			setError(err instanceof Error ? err.message : "Upload failed");
			setMessage("Upload failed. Try again.");
		}
	};

	return (
		<section className="flex flex-col gap-3 rounded border border-slate-200 bg-white p-4 text-sm text-slate-700">
			<header className="flex flex-col gap-1">
				<h3 className="text-base font-semibold text-slate-900">Submit a student ID</h3>
				<p className="text-xs text-slate-500">
					Upload a clear image of your university student card or official enrollment letter. Moderators review
					documents within 24 hours.
				</p>
			</header>
			<button
				type="button"
				onClick={handleSelect}
				disabled={disabled || status === "uploading"}
				className="w-fit rounded bg-indigo-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-indigo-700 disabled:opacity-50"
			>
				{status === "uploading" ? "Uploading…" : "Choose file"}
			</button>
			<p className="text-xs text-slate-500">Accepted: JPG, PNG, WebP, or PDF up to 6MB.</p>
			<p
				className={`rounded px-3 py-2 text-xs ${status === "success"
						? "border border-emerald-200 bg-emerald-50 text-emerald-700"
						: status === "error"
							? "border border-rose-200 bg-rose-50 text-rose-700"
							: "border border-slate-200 bg-slate-50 text-slate-600"
					}`}
			>
				{error ?? message}
			</p>
			<input
				ref={inputRef}
				type="file"
				accept={ACCEPTED_TYPES.join(",")}
				aria-label="Upload document"
				className="hidden"
				onChange={(event) => void handleFile(event)}
			/>
		</section>
	);
}
