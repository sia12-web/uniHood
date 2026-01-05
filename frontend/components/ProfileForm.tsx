"use client";

import { FormEvent, KeyboardEvent, ReactNode, useCallback, useContext, useEffect, useMemo, useState } from "react";

/* Image removed */
import AvatarUploader from "./AvatarUploader";
import type { ProfilePatchPayload } from "@/lib/identity";
import type { ProfileRecord, SocialLinks } from "@/lib/types";
import { ToastContext } from "@/components/providers/toast-provider";
/* cn removed */

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

	// Extended fields
	const [gender, setGender] = useState<string>(profile.gender ?? "");
	const [birthday, setBirthday] = useState<string>(profile.birthday ? new Date(profile.birthday).toISOString().split('T')[0] : "");
	const [hometown, setHometown] = useState<string>(profile.hometown ?? "");
	const [height, setHeight] = useState<string>(profile.height ? String(profile.height) : "");
	const [languages, setLanguages] = useState<string>(profile.languages ? profile.languages.join(", ") : "");

	const [saving, setSaving] = useState<boolean>(false);
	const [feedback, setFeedback] = useState<string | null>(null);
	const [error, setError] = useState<string | null>(null);





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
		setGender(next.gender ?? "");
		setBirthday(next.birthday ? new Date(next.birthday).toISOString().split('T')[0] : "");
		setHometown(next.hometown ?? "");
		setHeight(next.height ? String(next.height) : "");
		setLanguages(next.languages ? next.languages.join(", ") : "");
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

		if (gender !== (current.gender ?? "")) {
			patch.gender = gender || null;
			changed = true;
		}

		const currentBday = current.birthday ? new Date(current.birthday).toISOString().split('T')[0] : "";
		if (birthday !== currentBday) {
			patch.birthday = birthday || null;
			changed = true;
		}

		const trimmedHometown = hometown.trim();
		if (trimmedHometown !== (current.hometown ?? "")) {
			patch.hometown = trimmedHometown || null;
			changed = true;
		}

		const parsedHeight = height ? parseInt(height) : null;
		if (parsedHeight !== (current.height ?? null)) {
			patch.height = parsedHeight;
			changed = true;
		}

		const normLangs = languages.split(",").map(l => l.trim()).filter(Boolean);
		const currentLangs = current.languages ?? [];
		// Simple array comparison (assuming order matters or handled reasonably)
		const langsChanged = normLangs.length !== currentLangs.length || normLangs.some((l, i) => l !== currentLangs[i]);
		if (langsChanged) {
			patch.languages = normLangs.length > 0 ? normLangs : null;
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
		<section>
			<h2 className="text-xl font-bold text-slate-900 mb-6">General</h2>

			{feedback ? (
				<p className="mb-4 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700 font-medium">{feedback}</p>
			) : null}
			{error ? (
				<p className="mb-4 rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700 font-medium">{error}</p>
			) : null}

			<form onSubmit={handleSubmitForm} className="flex flex-col gap-6">
				<div className="flex flex-col md:flex-row gap-8">
					<div id="section-avatar" className="shrink-0 flex flex-col gap-4">
						<AvatarUploader
							avatarUrl={current.avatar_url ?? null}
							onUpload={handleAvatarChange}
							disabled={saving}
							onChange={(next) => syncProfile(next)}
						/>
						<div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm text-center">
							<div className="flex items-center justify-center gap-1">
								<span className="text-2xl font-bold text-slate-900">
									{current.reputation_score ? current.reputation_score.toFixed(1) : "New"}
								</span>
								{current.reputation_score ? <span className="text-amber-400 text-lg">★</span> : null}
							</div>
							<div className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Reputation</div>
							<div className="text-xs text-slate-400 mt-1">{current.review_count || 0} Reviews</div>
						</div>
					</div>

					<div className="flex-1 flex flex-col gap-4">
						<label className="flex flex-col gap-1.5 text-sm text-slate-700">
							<span className="font-semibold text-slate-900">Display Name</span>
							<input
								type="text"
								value={displayName}
								maxLength={50}
								onChange={(event) => setDisplayName(event.target.value)}
								placeholder="Your name"
								className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm placeholder:text-slate-400 focus:border-indigo-600 focus:ring-indigo-600 focus:outline-none transition-all shadow-sm"
							/>
						</label>
						<label id="section-bio" className="flex flex-col gap-1.5 text-sm text-slate-700">
							<span className="font-semibold text-slate-900">Bio</span>
							<textarea
								value={bio}
								onChange={(event) => setBio(event.target.value)}
								maxLength={500}
								rows={3}
								className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm placeholder:text-slate-400 focus:border-indigo-600 focus:ring-indigo-600 focus:outline-none transition-all resize-none shadow-sm"
							/>
							<span className="text-xs text-slate-400 text-right">{characterCount}</span>
						</label>
					</div>
				</div>

				<div className="grid gap-6 md:grid-cols-2 pt-2">
					<label className="flex flex-col gap-1.5 text-sm text-slate-700">
						<span className="font-semibold text-slate-900">Gender</span>
						<select
							value={gender}
							onChange={(event) => setGender(event.target.value)}
							className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm focus:border-indigo-600 focus:ring-indigo-600 focus:outline-none transition-all shadow-sm"
						>
							<option value="" disabled hidden>Select your gender</option>
							<option value="Male">Male</option>
							<option value="Female">Female</option>
							<option value="Non-binary">Non-binary</option>
							<option value="Prefer not to say">Prefer not to say</option>
						</select>
					</label>
					<label className="flex flex-col gap-1.5 text-sm text-slate-700">
						<span className="font-semibold text-slate-900">Birthday</span>
						<input
							type="date"
							value={birthday}
							onChange={(event) => setBirthday(event.target.value)}
							className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm focus:border-indigo-600 focus:ring-indigo-600 focus:outline-none transition-all shadow-sm"
						/>
					</label>
				</div>

				<div className="grid gap-6 md:grid-cols-2 pt-2">
					<label className="flex flex-col gap-1.5 text-sm text-slate-700">
						<span className="font-semibold text-slate-900">Hometown</span>
						<input
							type="text"
							value={hometown}
							onChange={(event) => setHometown(event.target.value)}
							maxLength={80}
							placeholder="e.g. London, UK"
							className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm focus:border-indigo-600 focus:ring-indigo-600 focus:outline-none transition-all shadow-sm"
						/>
					</label>
					<label className="flex flex-col gap-1.5 text-sm text-slate-700">
						<span className="font-semibold text-slate-900">Height (cm)</span>
						<input
							type="number"
							value={height}
							onChange={(event) => setHeight(event.target.value)}
							placeholder="e.g. 175"
							className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm focus:border-indigo-600 focus:ring-indigo-600 focus:outline-none transition-all shadow-sm"
						/>
					</label>
				</div>

				<label className="flex flex-col gap-1.5 text-sm text-slate-700 pt-2">
					<span className="font-semibold text-slate-900">Languages</span>
					<input
						type="text"
						value={languages}
						onChange={(event) => setLanguages(event.target.value)}
						placeholder="English, Spanish, French..."
						className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm focus:border-indigo-600 focus:ring-indigo-600 focus:outline-none transition-all shadow-sm"
					/>
				</label>

				<div id="section-details" className="grid gap-6 md:grid-cols-2 pt-2">
					<label className="flex flex-col gap-1.5 text-sm text-slate-700">
						<span className="font-semibold text-slate-900">Major or Program</span>
						<input
							type="text"
							value={major}
							onChange={(event) => setMajor(event.target.value)}
							maxLength={80}
							placeholder="Select your major"
							className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm focus:border-indigo-600 focus:ring-indigo-600 focus:outline-none transition-all shadow-sm"
						/>
					</label>
					<label className="flex flex-col gap-1.5 text-sm text-slate-700">
						<span className="font-semibold text-slate-900">Graduation Year</span>
						<input
							type="number"
							value={graduationYear}
							onChange={(event) => setGraduationYear(event.target.value)}
							min={gradYearMin}
							max={gradYearMax}
							placeholder="Select your year"
							className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm focus:border-indigo-600 focus:ring-indigo-600 focus:outline-none transition-all shadow-sm"
						/>
					</label>
				</div>

				<section id="section-passions" className="flex flex-col gap-2 pt-2">
					<div className="flex flex-col gap-1">
						<span className="text-sm font-semibold text-slate-900">Passions</span>
						<p className="text-xs text-slate-500">
							Highlight up to {PASSION_LIMIT} areas you care about.{" "}
							{passionSlots > 0
								? `${passionSlots} slot${passionSlots === 1 ? "" : "s"} left.`
								: "All slots used."}
						</p>
					</div>
					<div className="flex flex-wrap gap-2 mb-2">
						{passions.map((item) => (
							<span
								key={item.toLowerCase()}
								className="inline-flex items-center gap-1.5 rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-700 border border-slate-200"
							>
								{item}
								<button
									type="button"
									onClick={() => removePassion(item)}
									className="text-slate-400 hover:text-rose-500 transition"
									aria-label={`Remove ${item}`}
								>
									×
								</button>
							</span>
						))}
					</div>
					<div className="flex gap-2">
						<input
							type="text"
							value={passionDraft}
							onChange={(event) => setPassionDraft(event.target.value.slice(0, 40))}
							onKeyDown={handlePassionKeyDown}
							maxLength={40}
							placeholder="Select or search passions"
							className="grow rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm focus:border-indigo-600 focus:ring-indigo-600 focus:outline-none transition-all shadow-sm"
						/>
					</div>
				</section>

				<label id="section-vision" className="flex flex-col gap-1.5 text-sm text-slate-700 pt-2">
					<span className="font-semibold text-slate-900">10-Year Vision</span>
					<input
						type="text"
						value={current.ten_year_vision || ""}
						onChange={(event) => syncProfile({ ...current, ten_year_vision: event.target.value })}
						maxLength={60}
						placeholder="Describe your 10-year vision..."
						className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm focus:border-indigo-600 focus:ring-indigo-600 focus:outline-none transition-all shadow-sm"
					/>
				</label>

				{gallerySlot}

				<div className="pt-6 border-t border-slate-100">
					<h3 className="text-sm font-semibold text-slate-900 mb-4">Social Links</h3>
					<p className="text-xs text-slate-500 mb-4">Connect your profiles.</p>
					<div className="grid gap-x-6 gap-y-4 md:grid-cols-4">
						<label className="flex flex-col gap-1.5 text-sm text-slate-700">
							<span className="font-medium text-xs text-slate-500 uppercase">Instagram</span>
							<div className="relative">
								<span className="absolute left-3 top-3 text-slate-400">@</span>
								<input
									type="text"
									value={socialLinks.instagram || ""}
									onChange={(e) => setSocialLinks({ ...socialLinks, instagram: e.target.value })}
									maxLength={30}
									className="w-full rounded-xl border border-slate-200 bg-slate-50 py-3 pl-8 pr-4 text-sm focus:border-indigo-600 focus:ring-indigo-600 focus:outline-none transition-all shadow-sm"
								/>
							</div>
						</label>
						<label className="flex flex-col gap-1.5 text-sm text-slate-700">
							<span className="font-medium text-xs text-slate-500 uppercase">Twitter / X</span>
							<div className="relative">
								<span className="absolute left-3 top-3 text-slate-400">@</span>
								<input
									type="text"
									value={socialLinks.twitter || ""}
									onChange={(e) => setSocialLinks({ ...socialLinks, twitter: e.target.value })}
									maxLength={30}
									className="w-full rounded-xl border border-slate-200 bg-slate-50 py-3 pl-8 pr-4 text-sm focus:border-indigo-600 focus:ring-indigo-600 focus:outline-none transition-all shadow-sm"
								/>
							</div>
						</label>
						<label className="flex flex-col gap-1.5 text-sm text-slate-700">
							<span className="font-medium text-xs text-slate-500 uppercase">TikTok</span>
							<div className="relative">
								<span className="absolute left-3 top-3 text-slate-400">@</span>
								<input
									type="text"
									value={socialLinks.tiktok || ""}
									onChange={(e) => setSocialLinks({ ...socialLinks, tiktok: e.target.value })}
									maxLength={30}
									className="w-full rounded-xl border border-slate-200 bg-slate-50 py-3 pl-8 pr-4 text-sm focus:border-indigo-600 focus:ring-indigo-600 focus:outline-none transition-all shadow-sm"
								/>
							</div>
						</label>
						<label className="flex flex-col gap-1.5 text-sm text-slate-700">
							<span className="font-medium text-xs text-slate-500 uppercase">LinkedIn</span>
							<input
								type="text"
								value={socialLinks.linkedin || ""}
								onChange={(e) => setSocialLinks({ ...socialLinks, linkedin: e.target.value })}
								maxLength={100}
								placeholder="https://"
								className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm focus:border-indigo-600 focus:ring-indigo-600 focus:outline-none transition-all shadow-sm"
							/>
						</label>
						<label className="flex flex-col gap-1.5 text-sm text-slate-700 md:col-span-4 mt-2">
							<span className="font-medium text-xs text-slate-500 uppercase">Website</span>
							<input
								type="url"
								value={socialLinks.website || ""}
								onChange={(e) => setSocialLinks({ ...socialLinks, website: e.target.value })}
								maxLength={200}
								placeholder="https://"
								className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm focus:border-indigo-600 focus:ring-indigo-600 focus:outline-none transition-all shadow-sm"
							/>
						</label>
					</div>
				</div>

				<div className="flex items-center justify-between pt-8 pb-2">
					<button
						type="button"
						onClick={() => onRequestDeletion?.()}
						className="text-sm font-medium text-rose-500 hover:text-rose-700 transition"
						disabled={!onRequestDeletion || deleteLoading}
					>
						{deleteLoading ? "Processing…" : "Delete account"}
					</button>
					<button
						type="submit"
						disabled={saving}
						className="rounded-lg bg-[#4f46e5] px-6 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-indigo-700 disabled:opacity-50"
					>
						{saving ? "Saving changes…" : "Save changes"}
					</button>
				</div>
			</form>
		</section>
	);
}
