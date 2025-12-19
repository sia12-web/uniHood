"use client";

import { FormEvent, KeyboardEvent, ReactNode, useCallback, useContext, useEffect, useMemo, useState } from "react";

import AvatarUploader from "./AvatarUploader";
import type { ProfilePatchPayload } from "@/lib/identity";
import { getCampusById } from "@/lib/identity";
import type { ProfileRecord, SocialLinks } from "@/lib/types";
import { ToastContext } from "@/components/providers/toast-provider";

type ProfileFormProps = {
	profile: ProfileRecord;
	onSubmit: (patch: ProfilePatchPayload) => Promise<ProfileRecord>;
	onAvatarUpload: (file: File) => Promise<ProfileRecord>;
	onRequestDeletion?: () => void;
	deleteLoading?: boolean;
	gallerySlot?: ReactNode;
};

// HANDLE_PATTERN was here but is no longer needed as we removed handle from the UI.
const PASSION_LIMIT = 6;

export default function ProfileForm({
	profile,
	onSubmit,
	onAvatarUpload,
	onRequestDeletion,
	deleteLoading = false,
	gallerySlot,
}: ProfileFormProps) {
	const toast = useContext(ToastContext);
	const [current, setCurrent] = useState<ProfileRecord>(profile);
	const [displayName, setDisplayName] = useState<string>(profile.display_name ?? "");
	const [bio, setBio] = useState<string>(profile.bio ?? "");
	const [visibility, setVisibility] = useState<"everyone" | "friends" | "none">(
		profile.privacy.visibility,
	);
	const [ghostMode, setGhostMode] = useState<boolean>(profile.privacy.ghost_mode);
	const [major, setMajor] = useState<string>(profile.major ?? "");
	const [graduationYear, setGraduationYear] = useState<string>(
		profile.graduation_year ? String(profile.graduation_year) : "",
	);
	const [passions, setPassions] = useState<string[]>(profile.passions ?? []);
	const [passionDraft, setPassionDraft] = useState<string>("");
	const [socialLinks, setSocialLinks] = useState<SocialLinks>(profile.social_links ?? {});
	const [saving, setSaving] = useState<boolean>(false);
	const [feedback, setFeedback] = useState<string | null>(null);
	const [error, setError] = useState<string | null>(null);
	const [campusName, setCampusName] = useState<string | null>(null);

	// Fetch campus name from API instead of showing raw UUID
	useEffect(() => {
		if (!current.campus_id) return;
		getCampusById(current.campus_id)
			.then((data) => {
				if (data?.name) setCampusName(data.name);
			})
			.catch(() => { });
	}, [current.campus_id]);

	const syncProfile = useCallback((next: ProfileRecord) => {
		setCurrent(next);
		setDisplayName(next.display_name ?? "");
		setBio(next.bio ?? "");
		setVisibility(next.privacy.visibility);
		setGhostMode(next.privacy.ghost_mode);
		setMajor(next.major ?? "");
		setGraduationYear(next.graduation_year ? String(next.graduation_year) : "");
		setPassions(next.passions ?? []);
		setSocialLinks(next.social_links ?? {});
		setPassionDraft("");
	}, []);

	useEffect(() => {
		syncProfile(profile);
	}, [profile, syncProfile]);

	const currentYear = useMemo(() => new Date().getFullYear(), []);
	const gradYearMin = currentYear;
	const gradYearMax = 2100;
	const characterCount = useMemo(() => `${bio.length}/500`, [bio.length]);
	const passionSlots = useMemo(() => PASSION_LIMIT - passions.length, [passions.length]);

	const buildPatch = (): { patch: ProfilePatchPayload; changed: boolean; error?: string } => {
		const patch: ProfilePatchPayload = {};
		let changed = false;
		const trimmedBio = bio.trim();
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

		const trimmedDisplayName = displayName.trim();
		if (trimmedDisplayName !== (current.display_name ?? "")) {
			patch.display_name = trimmedDisplayName || undefined;
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

		// Check social links changes
		const currentSocial = current.social_links ?? {};
		const socialChanged =
			(socialLinks.instagram ?? "") !== (currentSocial.instagram ?? "") ||
			(socialLinks.linkedin ?? "") !== (currentSocial.linkedin ?? "") ||
			(socialLinks.twitter ?? "") !== (currentSocial.twitter ?? "") ||
			(socialLinks.tiktok ?? "") !== (currentSocial.tiktok ?? "") ||
			(socialLinks.website ?? "") !== (currentSocial.website ?? "");

		if (socialChanged) {
			patch.social_links = socialLinks;
			changed = true;
		}

		const nextVision = (current.ten_year_vision ?? "").trim();
		const oldVision = (profile.ten_year_vision ?? "").trim();
		if (nextVision !== oldVision) {
			patch.ten_year_vision = nextVision || null;
			changed = true;
		}

		return { patch, changed };
	};

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
			toast?.push({ title: "Photo updated", description: "Your profile photo has been saved.", variant: "success" });
			return updated;
		} catch (err) {
			const message = err instanceof Error ? err.message : "Failed to update avatar";
			setError(message);
			toast?.push({ title: "Photo update failed", description: message, variant: "error" });
			throw err;
		}
	};

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
					<strong>Email:</strong> {current.email || "Not set"}
				</p>
				<p>
					<strong>Verified:</strong> {current.email_verified ? "Yes" : "Pending"}
				</p>
				<p>
					<strong>Campus:</strong> {campusName || "Not set"}
				</p>
			</section>
			<AvatarUploader
				avatarUrl={current.avatar_url ?? null}
				onUpload={handleAvatarChange}
				disabled={saving}
				onChange={(next) => syncProfile(next)}
			/>
			{feedback ? (
				<p className="rounded border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">{feedback}</p>
			) : null}
			{error ? (
				<p className="rounded border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</p>
			) : null}
			<form onSubmit={handleSubmitForm} className="flex flex-col gap-4">
				<label className="flex flex-col gap-1 text-sm text-slate-700">
					<span className="font-medium">Display Name</span>
					<input
						type="text"
						value={displayName}
						maxLength={50}
						onChange={(event) => setDisplayName(event.target.value)}
						placeholder="Your name as shown to others"
						className="rounded border border-slate-300 px-3 py-2 text-sm focus:border-slate-500 focus:outline-none"
					/>
					<span className="text-xs text-slate-500">This is how your name appears on your profile and in chats.</span>
				</label>
				{gallerySlot ? <div className="rounded-2xl border border-slate-200 bg-slate-50/70 p-4">{gallerySlot}</div> : null}
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

				<label className="flex flex-col gap-1 text-sm text-slate-700">
					<span className="font-medium">10-Year Vision</span>
					<textarea
						value={current.ten_year_vision || ""}
						onChange={(event) => syncProfile({ ...current, ten_year_vision: event.target.value })}
						maxLength={60}
						placeholder="e.g., Founding a startup, Exploring Mars..."
						rows={2}
						className="rounded border border-slate-300 px-3 py-2 text-sm focus:border-slate-500 focus:outline-none"
					/>
					<span className="text-xs text-slate-500">How do you see yourself in the future? (Max 60 chars)</span>
				</label>

				<section className="flex flex-col gap-4 border-t border-slate-200 pt-4">
					<h3 className="text-sm font-medium text-slate-900">Social Links</h3>
					<div className="grid gap-4 md:grid-cols-2">
						<label className="flex flex-col gap-1 text-sm text-slate-700">
							<span className="font-medium">Instagram</span>
							<div className="relative">
								<span className="absolute left-3 top-2 text-slate-400">@</span>
								<input
									type="text"
									value={socialLinks.instagram || ""}
									onChange={(e) => setSocialLinks({ ...socialLinks, instagram: e.target.value })}
									maxLength={30}
									placeholder="username"
									className="w-full rounded border border-slate-300 py-2 pl-7 pr-3 text-sm focus:border-slate-500 focus:outline-none"
								/>
							</div>
						</label>
						<label className="flex flex-col gap-1 text-sm text-slate-700">
							<span className="font-medium">Twitter / X</span>
							<div className="relative">
								<span className="absolute left-3 top-2 text-slate-400">@</span>
								<input
									type="text"
									value={socialLinks.twitter || ""}
									onChange={(e) => setSocialLinks({ ...socialLinks, twitter: e.target.value })}
									maxLength={30}
									placeholder="username"
									className="w-full rounded border border-slate-300 py-2 pl-7 pr-3 text-sm focus:border-slate-500 focus:outline-none"
								/>
							</div>
						</label>
						<label className="flex flex-col gap-1 text-sm text-slate-700">
							<span className="font-medium">TikTok</span>
							<div className="relative">
								<span className="absolute left-3 top-2 text-slate-400">@</span>
								<input
									type="text"
									value={socialLinks.tiktok || ""}
									onChange={(e) => setSocialLinks({ ...socialLinks, tiktok: e.target.value })}
									maxLength={30}
									placeholder="username"
									className="w-full rounded border border-slate-300 py-2 pl-7 pr-3 text-sm focus:border-slate-500 focus:outline-none"
								/>
							</div>
						</label>
						<label className="flex flex-col gap-1 text-sm text-slate-700">
							<span className="font-medium">LinkedIn</span>
							<input
								type="text"
								value={socialLinks.linkedin || ""}
								onChange={(e) => setSocialLinks({ ...socialLinks, linkedin: e.target.value })}
								maxLength={100}
								placeholder="Profile URL or username"
								className="rounded border border-slate-300 px-3 py-2 text-sm focus:border-slate-500 focus:outline-none"
							/>
						</label>
						<label className="flex flex-col gap-1 text-sm text-slate-700 md:col-span-2">
							<span className="font-medium">Website</span>
							<input
								type="url"
								value={socialLinks.website || ""}
								onChange={(e) => setSocialLinks({ ...socialLinks, website: e.target.value })}
								maxLength={200}
								placeholder="https://your-site.com"
								className="rounded border border-slate-300 px-3 py-2 text-sm focus:border-slate-500 focus:outline-none"
							/>
						</label>
					</div>
				</section>

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
