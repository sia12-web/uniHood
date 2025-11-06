"use client";

import { FormEvent, KeyboardEvent, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";

import AvatarUploader from "./AvatarUploader";
import ProfileGalleryManager from "./ProfileGalleryManager";
import type { ProfilePatchPayload } from "@/lib/identity";
import type { ProfileRecord } from "@/lib/types";
import { ToastContext } from "@/components/providers/toast-provider";

type ProfileFormProps = {
	profile: ProfileRecord;
	onSubmit: (patch: ProfilePatchPayload) => Promise<ProfileRecord>;
	onAvatarUpload: (file: File) => Promise<ProfileRecord>;
	onGalleryUpload: (file: File) => Promise<ProfileRecord>;
	onGalleryRemove: (key: string) => Promise<ProfileRecord>;
	onRequestDeletion?: () => void;
	deleteLoading?: boolean;
	onDirtyChange?: (dirty: boolean, fields: string[]) => void;
	galleryUploading?: boolean;
	galleryRemovingKey?: string | null;
	galleryError?: string | null;
	galleryDisabled?: boolean;
	galleryLimit?: number;
};

const HANDLE_PATTERN = /[^a-z0-9_]/g;
const PASSION_LIMIT = 6;

export default function ProfileForm({
	profile,
	onSubmit,
	onAvatarUpload,
	onGalleryUpload,
	onGalleryRemove,
	onRequestDeletion,
	deleteLoading = false,
	onDirtyChange,
	galleryUploading = false,
	galleryRemovingKey = null,
	galleryError = null,
	galleryDisabled = false,
	galleryLimit,
}: ProfileFormProps) {
	const toast = useContext(ToastContext);
	const [current, setCurrent] = useState<ProfileRecord>(profile);
	const [handle, setHandle] = useState<string>(profile.handle ?? "");
	const [bio, setBio] = useState<string>(profile.bio ?? "");
	const [visibility, setVisibility] = useState<"everyone" | "friends" | "none">(
		profile.privacy.visibility,
	);
	const [ghostMode, setGhostMode] = useState<boolean>(profile.privacy.ghost_mode);
	const [statusText, setStatusText] = useState<string>(profile.status?.text ?? "");
	const [statusEmoji, setStatusEmoji] = useState<string>(profile.status?.emoji ?? "");
	const [major, setMajor] = useState<string>(profile.major ?? "");
	const [graduationYear, setGraduationYear] = useState<string>(
		profile.graduation_year ? String(profile.graduation_year) : "",
	);
	const [passions, setPassions] = useState<string[]>(profile.passions ?? []);
	const [passionDraft, setPassionDraft] = useState<string>("");
	const [saving, setSaving] = useState<boolean>(false);
	const [feedback, setFeedback] = useState<string | null>(null);
	const [error, setError] = useState<string | null>(null);

	const syncProfile = useCallback((next: ProfileRecord) => {
		setCurrent(next);
		setHandle(next.handle ?? "");
		setBio(next.bio ?? "");
		setVisibility(next.privacy.visibility);
		setGhostMode(next.privacy.ghost_mode);
		setStatusText(next.status?.text ?? "");
		setStatusEmoji(next.status?.emoji ?? "");
		setMajor(next.major ?? "");
		setGraduationYear(next.graduation_year ? String(next.graduation_year) : "");
		setPassions(next.passions ?? []);
		setPassionDraft("");
	}, []);

	useEffect(() => {
		syncProfile(profile);
	}, [profile, syncProfile]);

	const currentYear = useMemo(() => new Date().getFullYear(), []);
	const gradYearMin = currentYear;
	const gradYearMax = 2100;
	const characterCount = useMemo(() => `${bio.length}/500`, [bio.length]);
	const statusCount = useMemo(() => `${statusText.length}/120`, [statusText.length]);
	const passionSlots = useMemo(() => PASSION_LIMIT - passions.length, [passions.length]);

	const buildPatch = useCallback((): { patch: ProfilePatchPayload; changed: boolean; error?: string } => {
		const patch: ProfilePatchPayload = {};
		let changed = false;
		const trimmedBio = bio.trim();
		const nextHandle = handle.trim().toLowerCase();
		const trimmedStatus = statusText.trim();
		const trimmedEmoji = statusEmoji.trim();
		const trimmedMajor = major.trim();
		const trimmedGraduationYear = graduationYear.trim();

		if (trimmedBio !== (current.bio ?? "")) {
			patch.bio = trimmedBio;
			changed = true;
		}
		if (visibility !== current.privacy.visibility || ghostMode !== current.privacy.ghost_mode) {
			patch.privacy = { visibility, ghost_mode: ghostMode };
			changed = true;
		}
		if (
			trimmedStatus !== (current.status?.text ?? "") ||
			trimmedEmoji !== (current.status?.emoji ?? "")
		) {
			patch.status = { text: trimmedStatus, emoji: trimmedEmoji };
			changed = true;
		}
		if (nextHandle && nextHandle !== current.handle) {
			patch.handle = nextHandle;
			changed = true;
		}
		if (trimmedMajor !== (current.major ?? "")) {
			patch.major = trimmedMajor ? trimmedMajor : null;
			changed = true;
		}
		if (trimmedGraduationYear) {
			const digitsOnly = /^\d{4}$/;
			if (!digitsOnly.test(trimmedGraduationYear)) {
				return { patch, changed, error: "Graduation year must be a 4-digit year." };
			}
		}
		const parsedYear = trimmedGraduationYear ? Number(trimmedGraduationYear) : null;
		const existingYear = current.graduation_year ?? null;
		if (parsedYear !== existingYear) {
			patch.graduation_year = parsedYear;
			changed = true;
		}
		const normalisedPassions = passions.map((item) => item.trim()).filter(Boolean);
		if (normalisedPassions.length > PASSION_LIMIT) {
			return { patch, changed, error: `Add up to ${PASSION_LIMIT} passions.` };
		}
		const currentPassions = current.passions ?? [];
		const passionsChanged =
			normalisedPassions.length !== currentPassions.length ||
			normalisedPassions.some((value, index) => value !== currentPassions[index]);
		if (passionsChanged) {
			patch.passions = normalisedPassions;
			changed = true;
		}
		return { patch, changed };
	}, [bio, current, ghostMode, graduationYear, handle, major, passions, statusEmoji, statusText, visibility]);

	const dirtyStateRef = useRef<{ dirty: boolean; key: string }>({ dirty: false, key: "" });

	useEffect(() => {
		if (!onDirtyChange) {
			return;
		}
		const { patch, changed } = buildPatch();
		const fields = Object.keys(patch);
		const key = fields.slice().sort().join("|");
		if (dirtyStateRef.current.dirty !== changed || dirtyStateRef.current.key !== key) {
			dirtyStateRef.current = { dirty: changed, key };
			onDirtyChange(changed, fields);
		}
	}, [buildPatch, onDirtyChange]);

	const handleSubmitForm = async (event: FormEvent<HTMLFormElement>) => {
		event.preventDefault();
		setFeedback(null);
		setError(null);
		const { patch, changed, error: validationError } = buildPatch();
		if (validationError) {
			setError(validationError);
            toast?.push({ title: validationError, variant: "warning" });
			return;
		}
		if (!changed) {
			setFeedback("No changes to save.");
            toast?.push({ title: "No changes to save", variant: "default" });
			return;
		}
		setSaving(true);
		try {
			const updated = await onSubmit(patch);
			syncProfile(updated);
			setFeedback("Profile updated.");
            toast?.push({ title: "Profile saved", description: "Your changes are live.", variant: "success" });
		} catch (err) {
			const message = err instanceof Error ? err.message : "Failed to update profile";
			setError(message);
            toast?.push({ title: "Profile save failed", description: message, variant: "error" });
		} finally {
			setSaving(false);
		}
	};

	const handleAvatarChange = async (file: File) => {
		setFeedback(null);
		setError(null);
		try {
			const updated = await onAvatarUpload(file);
			syncProfile(updated);
			setFeedback("Avatar updated.");
			if (process.env.NODE_ENV !== "production") {
				console.info("[settings/profile] Avatar saved", {
					avatarKey: updated.avatar_key,
					avatarUrl: updated.avatar_url,
				});
			}
            toast?.push({ title: "Photo updated", description: "Your profile photo has been saved.", variant: "success" });
			return updated;
		} catch (err) {
			const message = err instanceof Error ? err.message : "Failed to update avatar";
			setError(message);
            toast?.push({ title: "Photo update failed", description: message, variant: "error" });
			throw err;
		}
	};

	const handleGalleryUpload = useCallback(
		async (file: File) => {
			const updated = await onGalleryUpload(file);
			syncProfile(updated);
			return updated;
		},
		[onGalleryUpload, syncProfile],
	);

	const handleGalleryRemove = useCallback(
		async (key: string) => {
			const updated = await onGalleryRemove(key);
			syncProfile(updated);
			return updated;
		},
		[onGalleryRemove, syncProfile],
	);

	const addPassion = useCallback(
		(value: string) => {
			const trimmed = value.trim().replace(/\s+/g, " ");
			if (!trimmed) {
				return;
			}
			if (passions.length >= PASSION_LIMIT) {
				setError(`You can add up to ${PASSION_LIMIT} passions.`);
				return;
			}
			if (passions.some((item) => item.toLowerCase() === trimmed.toLowerCase())) {
				return;
			}
			setPassions([...passions, trimmed]);
			setPassionDraft("");
			setError(null);
			setFeedback(null);
		},
		[passions, setError, setFeedback],
	);

	const removePassion = useCallback(
		(value: string) => {
			setPassions((prev) => prev.filter((item) => item !== value));
			setError(null);
		},
		[setError],
	);

	const handlePassionKeyDown = useCallback(
		(event: KeyboardEvent<HTMLInputElement>) => {
			if (event.key === "Enter" || event.key === ",") {
				event.preventDefault();
				addPassion(passionDraft);
			}
		},
		[addPassion, passionDraft],
	);

	return (
		<section className="flex flex-col gap-6">
			<section className="flex flex-col gap-2 rounded border border-slate-200 bg-white px-4 py-3 text-sm text-slate-700">
				<p>
					<strong>Email:</strong> {current.email ?? "—"}
				</p>
				<p>
					<strong>Verified:</strong> {current.email_verified ? "Yes" : "Pending"}
				</p>
				<p>
					<strong>Campus ID:</strong> {current.campus_id ?? "—"}
				</p>
			</section>
			<AvatarUploader
				avatarUrl={current.avatar_url ?? null}
				onUpload={handleAvatarChange}
				disabled={saving}
				onChange={(next) => syncProfile(next)}
			/>
			<ProfileGalleryManager
				images={current.gallery ?? []}
				onUpload={handleGalleryUpload}
				onRemove={handleGalleryRemove}
				uploading={galleryUploading}
				removingKey={galleryRemovingKey ?? undefined}
				error={galleryError ?? undefined}
				disabled={galleryDisabled}
				limit={galleryLimit}
			/>
			{feedback ? (
				<p className="rounded border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">{feedback}</p>
			) : null}
			{error ? (
				<p className="rounded border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</p>
			) : null}
			<form onSubmit={handleSubmitForm} className="flex flex-col gap-4">
				<label className="flex flex-col gap-1 text-sm text-slate-700">
					<span className="font-medium">Username</span>
					<input
						type="text"
						value={handle}
						maxLength={20}
						onChange={(event) =>
							setHandle(event.target.value.toLowerCase().replace(HANDLE_PATTERN, ""))
						}
						className="rounded border border-slate-300 px-3 py-2 text-sm focus:border-slate-500 focus:outline-none"
					/>
					<span className="text-xs text-slate-500">Lowercase letters, numbers, underscores only.</span>
				</label>
				<label className="flex flex-col gap-1 text-sm text-slate-700">
					<span className="font-medium">Bio</span>
					<textarea
						value={bio}
						onChange={(event) => setBio(event.target.value)}
						maxLength={500}
						rows={4}
						className="rounded border border-slate-300 px-3 py-2 text-sm focus:border-slate-500 focus:outline-none"
					/>
					<span className="text-xs text-slate-500">{characterCount}</span>
				</label>
				<div className="grid gap-4 md:grid-cols-2">
					<label className="flex flex-col gap-1 text-sm text-slate-700">
						<span className="font-medium">What&apos;s your vibe?</span>
						<input
							type="text"
							value={statusText}
							onChange={(event) => setStatusText(event.target.value)}
							maxLength={120}
							placeholder="Open to study collabs today"
							className="rounded border border-slate-300 px-3 py-2 text-sm focus:border-slate-500 focus:outline-none"
						/>
						<span className="flex items-start justify-between text-xs text-slate-500">
							<span>{statusCount}</span>
							<span className="max-w-[12rem] text-right text-slate-400">
								Let friends know how you&apos;re feeling—e.g., &ldquo;Open to study collabs today&rdquo; or &ldquo;Busy with finals&rdquo;.
							</span>
						</span>
					</label>
					<label className="flex flex-col gap-1 text-sm text-slate-700">
						<span className="font-medium">Mood emoji</span>
						<input
							type="text"
							value={statusEmoji}
							onChange={(event) => setStatusEmoji(event.target.value.slice(0, 4))}
							maxLength={4}
							placeholder="🧠📚"
							className="rounded border border-slate-300 px-3 py-2 text-sm focus:border-slate-500 focus:outline-none"
						/>
						<span className="flex items-start justify-between text-xs text-slate-500">
							<span>Up to 4 characters.</span>
							<span className="max-w-[12rem] text-right text-slate-400">
								Try quick cues like 🧠📚, 🎨✨, or ✅ so classmates know your vibe at a glance.
							</span>
						</span>
					</label>
				</div>
				<div className="grid gap-4 md:grid-cols-2">
					<label className="flex flex-col gap-1 text-sm text-slate-700">
						<span className="font-medium">Major or Program</span>
						<input
							type="text"
							value={major}
							onChange={(event) => setMajor(event.target.value)}
							maxLength={80}
							placeholder="e.g., Computer Science"
							className="rounded border border-slate-300 px-3 py-2 text-sm focus:border-slate-500 focus:outline-none"
						/>
						<span className="text-xs text-slate-500">Share what you&apos;re studying to guide collaboration suggestions.</span>
					</label>
					<label className="flex flex-col gap-1 text-sm text-slate-700">
						<span className="font-medium">Graduation Year</span>
						<input
							type="number"
							value={graduationYear}
							onChange={(event) => setGraduationYear(event.target.value)}
							min={gradYearMin}
							max={gradYearMax}
							placeholder={`${gradYearMin + 3}`}
							className="rounded border border-slate-300 px-3 py-2 text-sm focus-border-slate-500 focus:outline-none"
						/>
						<span className="text-xs text-slate-500">Use the year you expect to finish your degree.</span>
					</label>
				</div>
				<section className="flex flex-col gap-2 text-sm text-slate-700">
					<div className="flex flex-col gap-1">
						<span className="font-medium">Passions</span>
						<p className="text-xs text-slate-500">
							Highlight up to {PASSION_LIMIT} areas you care about.{" "}
							{passionSlots > 0
								? `${passionSlots} slot${passionSlots === 1 ? "" : "s"} left.`
								: "All slots used."}
						</p>
					</div>
					{passions.length > 0 ? (
						<div className="flex flex-wrap gap-2">
							{passions.map((item) => (
								<span
									key={item.toLowerCase()}
									className="group inline-flex items-center gap-2 rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-700"
								>
									{item}
									<button
										type="button"
										onClick={() => removePassion(item)}
										className="text-slate-500 transition hover:text-rose-500"
										aria-label={`Remove ${item}`}
									>
										×
									</button>
								</span>
							))}
						</div>
					) : null}
					<div className="flex flex-wrap gap-2">
						<input
							type="text"
							value={passionDraft}
							onChange={(event) => setPassionDraft(event.target.value.slice(0, 40))}
							onKeyDown={handlePassionKeyDown}
							maxLength={40}
							placeholder={passions.length === 0 ? "e.g., Hackathons" : "Add another passion"}
							className="grow rounded border border-slate-300 px-3 py-2 text-sm focus:border-slate-500 focus:outline-none"
						/>
						<button
							type="button"
							onClick={() => addPassion(passionDraft)}
							disabled={passionDraft.trim().length === 0}
							className="rounded border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
						>
							Add
						</button>
					</div>
				</section>
				<div className="grid gap-4 md:grid-cols-2">
					<label className="flex flex-col gap-1 text-sm text-slate-700">
						<span className="font-medium">Profile Visibility</span>
						<select
							value={visibility}
							onChange={(event) => setVisibility(event.target.value as typeof visibility)}
							className="rounded border border-slate-300 px-3 py-2 text-sm focus:border-slate-500 focus:outline-none"
						>
							<option value="everyone">Visible to everyone</option>
							<option value="friends">Friends only</option>
							<option value="none">Hidden</option>
						</select>
					</label>
					<label className="flex items-center gap-3 text-sm text-slate-700">
						<input
							type="checkbox"
							checked={ghostMode}
							onChange={(event) => setGhostMode(event.target.checked)}
							className="h-4 w-4 rounded border-slate-300 text-slate-900 focus:ring-slate-500"
						/>
						<span>
							<strong>Ghost mode</strong> hides you from discovery surfaces.
						</span>
					</label>
				</div>
				<div className="flex flex-col gap-3 border-t border-slate-200 pt-4 sm:flex-row sm:items-center sm:justify-between">
					<button
						type="submit"
						disabled={saving}
						className="w-fit rounded bg-slate-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-slate-800 disabled:opacity-50"
					>
						{saving ? "Saving changes…" : "Save changes"}
					</button>
					<button
						type="button"
						onClick={() => onRequestDeletion?.()}
						className="w-fit rounded border border-rose-200 px-4 py-2 text-sm font-semibold text-rose-600 transition hover:bg-rose-50 disabled:opacity-60"
						disabled={!onRequestDeletion || deleteLoading}
					>
						{deleteLoading ? "Processing…" : "Delete account"}
					</button>
				</div>
			</form>
		</section>
	);
}

