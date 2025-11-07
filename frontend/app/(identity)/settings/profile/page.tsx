"use client";

import Image from "next/image";
import { useCallback, useEffect, useMemo, useState } from "react";

import BrandLogo from "@/components/BrandLogo";
import ProfileForm from "@/components/ProfileForm";
import ProfileGalleryManager from "@/components/ProfileGalleryManager";
import {
	commitAvatar,
	commitGallery,
	fetchProfile,
	patchProfile,
	presignAvatar,
	presignGallery,
	removeGalleryImage,
	type PresignPayload,
	type ProfilePatchPayload,
} from "@/lib/identity";
import { requestDeletion } from "@/lib/privacy";
import { getDemoCampusId, getDemoUserId } from "@/lib/env";
import { onAuthChange, readAuthUser, type AuthUser } from "@/lib/auth-storage";
import type { ProfileRecord } from "@/lib/types";

const DEMO_USER_ID = getDemoUserId();
const DEMO_CAMPUS_ID = getDemoCampusId();
const DRAFT_STORAGE_KEY = "divan.profile.draft";
const FEATURE_CALL_OUTS = [
	{
		title: "Surface in the Social Hub",
		description:
			"Finish your passions and bio to show up in the nearby map and recommendations feed.",
	},
	{
		title: "Unlock smarter invites",
		description:
			"Graduation year and major help Divan route study room and project invites to you first.",
	},
	{
		title: "Build trust streaks",
		description:
			"An avatar and status keep friends in the loop and boost your reputation milestones.",
	},
];
const PROGRESS_SEGMENTS = 20;

type StoredProfileDraft = {
	id: string;
	email: string;
	email_verified: boolean;
	handle: string;
	display_name: string;
	bio: string;
	campus_id?: string | null;
	privacy: ProfileRecord["privacy"];
	status: ProfileRecord["status"];
	major?: string | null;
	graduation_year?: number | null;
	passions: string[];
	gallery?: ProfileRecord["gallery"];
};

async function uploadToPresignedUrl(url: string, file: File): Promise<void> {
	const response = await fetch(url, {
		method: "PUT",
		headers: { "Content-Type": file.type || "application/octet-stream" },
		body: file,
	});
	if (!response.ok) {
		throw new Error(`Upload failed (${response.status})`);
	}
}

function createOfflineProfile(userId: string, campusId: string | null): ProfileRecord {
	return {
		id: userId || "draft-user",
		email: "you@yourcampus.edu",
		email_verified: false,
		handle: "",
		display_name: "New to Divan",
		bio: "",
		avatar_url: null,
		avatar_key: null,
		campus_id: campusId,
		privacy: {
			visibility: "everyone",
			ghost_mode: false,
			discoverable_by_email: true,
			show_online_status: true,
			share_activity: true,
		},
		status: {
			text: "",
			emoji: "",
			updated_at: new Date().toISOString(),
		},
		major: null,
		graduation_year: null,
		passions: [],
		gallery: [],
	};
}

function normaliseDraft(candidate: Partial<StoredProfileDraft> | null, userId: string, campusId: string | null): ProfileRecord {
	const base = createOfflineProfile(userId, campusId);
	if (!candidate) {
		return base;
	}
	return {
		...base,
		...candidate,
		privacy: { ...base.privacy, ...(candidate.privacy ?? {}) },
		status: { ...base.status, ...(candidate.status ?? {}) },
		passions: Array.isArray(candidate.passions)
			? candidate.passions.filter((item) => typeof item === "string").map((item) => item.trim()).filter(Boolean)
			: base.passions,
		gallery: Array.isArray(candidate.gallery)
			? candidate.gallery.filter(
				(item): item is { key: string; url: string } =>
					Boolean(item) && typeof (item as { key?: unknown }).key === "string" && typeof (item as { url?: unknown }).url === "string",
			  )
			: base.gallery,
	};
}

function loadDraftFromStorage(userId: string, campusId: string | null): ProfileRecord | null {
	if (typeof window === "undefined") {
		return null;
	}
	try {
		const raw = window.localStorage.getItem(DRAFT_STORAGE_KEY);
		if (!raw) {
			return null;
		}
		const parsed = JSON.parse(raw) as Partial<StoredProfileDraft> | null;
		return normaliseDraft(parsed, userId, campusId);
	} catch {
		return null;
	}
}

function storeDraftProfile(profile: ProfileRecord): void {
	if (typeof window === "undefined") {
		return;
	}
	const payload: StoredProfileDraft = {
		id: profile.id,
		email: profile.email,
		email_verified: profile.email_verified,
		handle: profile.handle,
		display_name: profile.display_name,
		bio: profile.bio,
		campus_id: profile.campus_id ?? null,
		privacy: profile.privacy,
		status: profile.status,
		major: profile.major ?? null,
		graduation_year: profile.graduation_year ?? null,
		passions: profile.passions ?? [],
		gallery: profile.gallery ?? [],
	};
	try {
		window.localStorage.setItem(DRAFT_STORAGE_KEY, JSON.stringify(payload));
	} catch {
		// Ignore persistence failures (quota, private mode, etc.).
	}
}

function applyProfilePatch(base: ProfileRecord, patch: ProfilePatchPayload): ProfileRecord {
	const baseBio = (base.bio ?? "").toString();
	const baseStatus =
		base.status ?? ({ text: "", emoji: "", updated_at: new Date().toISOString() } as ProfileRecord["status"]);
	const next: ProfileRecord = {
		...base,
		bio: patch.bio ?? baseBio,
		display_name: patch.display_name ?? base.display_name,
		handle: patch.handle ?? base.handle,
		passions: patch.passions ?? base.passions ?? [],
	};

	if (patch.privacy) {
		next.privacy = { ...base.privacy, ...patch.privacy };
	}
	if (patch.status) {
		next.status = {
			...baseStatus,
			...patch.status,
			updated_at: patch.status.updated_at ?? new Date().toISOString(),
		};
	}
	if ("major" in patch) {
		next.major = patch.major ?? null;
	}
	if ("graduation_year" in patch) {
		next.graduation_year = patch.graduation_year ?? null;
	}

	return next;
}

function calculateCompletion(profile: ProfileRecord): number {
	const bio = (profile.bio ?? "").trim();
	const handle = (profile.handle ?? "").trim();
	const passionsCount = profile.passions?.length ?? 0;
	const statusText = (profile.status?.text ?? "").trim();
	const major = (profile.major ?? "").trim();
	const checks = [
		Boolean(profile.avatar_url),
		handle.length >= 3,
		bio.length >= 40,
		Boolean(major),
		Boolean(profile.graduation_year),
		passionsCount >= 3,
		statusText.length > 0,
	];
	const filled = checks.filter(Boolean).length;
	return Math.round((filled / checks.length) * 100);
}

function buildMissingTasks(profile: ProfileRecord): string[] {
	const tasks: string[] = [];
	const handle = (profile.handle ?? "").trim();
	const bio = (profile.bio ?? "").trim();
	const major = (profile.major ?? "").trim();
	const statusText = (profile.status?.text ?? "").trim();
	const passionsCount = profile.passions?.length ?? 0;
	if (!handle) {
		tasks.push("Claim your Divan handle so classmates can @mention you.");
	}
	if (!bio) {
		tasks.push("Write a short bio that spotlights what you want to work on.");
	}
	if (!profile.avatar_url) {
		tasks.push("Add an avatar to boost trust in invites and room requests.");
	}
	if (passionsCount < 3) {
		tasks.push("Share at least three passions to unlock tailored recommendations.");
	}
	if (!major) {
		tasks.push("Tell us your major or focus area so we can match study buddies.");
	}
	if (!profile.graduation_year) {
		tasks.push("Set your graduation year to join the right campus cohorts.");
	}
	if (!statusText) {
		tasks.push("Set a quick status so friends know when you are open to connect.");
	}
	return tasks.slice(0, 4);
}

async function readFileAsDataUrl(file: File): Promise<string> {
	return new Promise((resolve, reject) => {
		const reader = new FileReader();
		reader.onload = () => {
			if (typeof reader.result === "string") {
				resolve(reader.result);
			} else {
				reject(new Error("Could not preview file"));
			}
		};
		reader.onerror = () => reject(reader.error ?? new Error("Failed to read file"));
		reader.readAsDataURL(file);
	});
}

export default function ProfileSettingsPage() {
	const [authUser, setAuthUser] = useState<AuthUser | null>(null);
	const [authReady, setAuthReady] = useState<boolean>(false);
	const [profile, setProfile] = useState<ProfileRecord | null>(null);
	const [draftProfile, setDraftProfile] = useState<ProfileRecord | null>(null);
	const [loading, setLoading] = useState<boolean>(true);
	const [error, setError] = useState<string | null>(null);
	const [reloadToken, setReloadToken] = useState<number>(0);
	const [deleteNotice, setDeleteNotice] = useState<string | null>(null);
	const [deleteLoading, setDeleteLoading] = useState<boolean>(false);
	const [galleryUploading, setGalleryUploading] = useState<boolean>(false);
	const [galleryRemovingKey, setGalleryRemovingKey] = useState<string | null>(null);
	const [galleryError, setGalleryError] = useState<string | null>(null);

	const isDraftMode = profile === null && draftProfile !== null;
	const activeProfile = profile ?? draftProfile;
	const completion = useMemo(() => (activeProfile ? calculateCompletion(activeProfile) : 0), [activeProfile]);
	const activeSegments = useMemo(() => {
		const clamped = Math.min(Math.max(completion, 0), 100);
		return Math.round((clamped / 100) * PROGRESS_SEGMENTS);
	}, [completion]);
	const missingTasks = useMemo(() => (activeProfile ? buildMissingTasks(activeProfile) : []), [activeProfile]);

	useEffect(() => {
		setAuthUser(readAuthUser());
		setAuthReady(true);
		const cleanup = onAuthChange(() => {
			setAuthUser(readAuthUser());
			setAuthReady(true);
		});
		return cleanup;
	}, []);

	useEffect(() => {
		if (!authReady) {
			return;
		}
		const userId = authUser?.userId ?? null;
		const campusId = authUser?.campusId ?? null;
		if (!userId) {
			setProfile(null);
			setDraftProfile(createOfflineProfile(DEMO_USER_ID, DEMO_CAMPUS_ID));
			setLoading(false);
			setError("Sign in to manage your profile.");
			return;
		}
		const safeUserId = userId;
		const safeCampusId = campusId;
		let cancelled = false;
		setLoading(true);
		async function loadProfile() {
			try {
				const record = await fetchProfile(safeUserId, safeCampusId);
				if (!cancelled) {
					setProfile(record);
					setDraftProfile(null);
					setError(null);
				}
			} catch (err) {
				if (!cancelled) {
					const rawMessage = err instanceof Error ? err.message : null;
					const displayMessage = rawMessage && rawMessage !== "Failed to fetch"
						? rawMessage
						: "Unable to load profile. Working from your last saved draft.";
					setProfile(null);
					setDraftProfile(
						loadDraftFromStorage(safeUserId, safeCampusId) ??
							createOfflineProfile(safeUserId, safeCampusId),
					);
					setError(displayMessage);
				}
			} finally {
				if (!cancelled) {
					setLoading(false);
				}
			}
		}
		void loadProfile();
		return () => {
			cancelled = true;
		};
	}, [authReady, authUser?.userId, authUser?.campusId, reloadToken]);

	useEffect(() => {
		if (!isDraftMode || !draftProfile) {
			return;
		}
		storeDraftProfile(draftProfile);
	}, [draftProfile, isDraftMode]);

	useEffect(() => {
		if (!profile || typeof window === "undefined") {
			return;
		}
		window.localStorage.removeItem(DRAFT_STORAGE_KEY);
	}, [profile]);

	const handleSubmit = useCallback(async (patch: ProfilePatchPayload) => {
		if (!authUser) {
			throw new Error("Sign in to update your profile.");
		}
		const updated = await patchProfile(authUser.userId, authUser.campusId ?? null, patch);
		setProfile(updated);
		setDraftProfile(null);
		return updated;
	}, [authUser]);

	const handleAvatarUpload = useCallback(async (file: File) => {
		if (!authUser) {
			throw new Error("Sign in to update your profile photo.");
		}
		const payload: PresignPayload = { mime: file.type || "application/octet-stream", bytes: file.size };
		const presigned = await presignAvatar(authUser.userId, authUser.campusId ?? null, payload);
		await uploadToPresignedUrl(presigned.url, file);
		const updated = await commitAvatar(authUser.userId, authUser.campusId ?? null, presigned.key);
		setProfile(updated);
		setDraftProfile(null);
		return updated;
	}, [authUser]);

	const handleDraftSubmit = useCallback(async (patch: ProfilePatchPayload) => {
		let result: ProfileRecord | null = null;
		setDraftProfile((prev) => {
			if (!prev) {
				return prev;
			}
			const updated = applyProfilePatch(prev, patch);
			result = updated;
			return updated;
		});
		if (!result) {
			throw new Error("Unable to update draft profile");
		}
		return result;
	}, []);

	const handleDraftAvatarUpload = useCallback(async (file: File) => {
		const dataUrl = await readFileAsDataUrl(file);
		let result: ProfileRecord | null = null;
		setDraftProfile((prev) => {
			if (!prev) {
				return prev;
			}
			const updated: ProfileRecord = {
				...prev,
				avatar_url: dataUrl,
				avatar_key: `local-${Date.now()}`,
			};
			result = updated;
			return updated;
		});
		if (!result) {
			throw new Error("Unable to update draft avatar");
		}
		return result;
	}, []);

	const handleGalleryUpload = useCallback(
		async (file: File) => {
			if (!authUser || isDraftMode) {
				const message = isDraftMode
					? "Reconnect to Divan to sync your gallery."
					: "Sign in to manage your gallery.";
				setGalleryError(message);
				throw new Error(message);
			}
			setGalleryError(null);
			setGalleryUploading(true);
			try {
				const payload: PresignPayload = { mime: file.type || "application/octet-stream", bytes: file.size };
				const presigned = await presignGallery(authUser.userId, authUser.campusId ?? null, payload);
				await uploadToPresignedUrl(presigned.url, file);
				const updated = await commitGallery(authUser.userId, authUser.campusId ?? null, presigned.key);
				setProfile(updated);
				setDraftProfile(null);
				return updated;
			} catch (err) {
				const message = err instanceof Error ? err.message : "Failed to upload photo";
				setGalleryError(message);
				throw err instanceof Error ? err : new Error(message);
			} finally {
				setGalleryUploading(false);
			}
		},
		[authUser, isDraftMode],
	);

	const handleGalleryRemove = useCallback(
		async (key: string) => {
			if (!authUser || isDraftMode) {
				const message = isDraftMode
					? "Reconnect to Divan to sync your gallery."
					: "Sign in to manage your gallery.";
				setGalleryError(message);
				throw new Error(message);
			}
			setGalleryError(null);
			setGalleryRemovingKey(key);
			try {
				const updated = await removeGalleryImage(authUser.userId, authUser.campusId ?? null, key);
				setProfile(updated);
				setDraftProfile(null);
				return updated;
			} catch (err) {
				const message = err instanceof Error ? err.message : "Failed to remove photo";
				setGalleryError(message);
				throw err instanceof Error ? err : new Error(message);
			} finally {
				setGalleryRemovingKey(null);
			}
		},
		[authUser, isDraftMode],
	);

	const retryFetch = useCallback(() => {
		setReloadToken((prev) => prev + 1);
	}, []);

	const handleRequestDeletion = useCallback(async () => {
		if (!profile || isDraftMode || deleteLoading || !authUser) {
			if (isDraftMode) {
				setDeleteNotice("Account deletion is available after you create and verify your Divan account.");
			}
			if (!authUser) {
				setDeleteNotice("Sign in to request account deletion.");
			}
			return;
		}
		const confirmed = window.confirm(
			"Deleting will revoke sessions, anonymize activity, and require email confirmation. Continue?",
		);
		if (!confirmed) {
			return;
		}
		setDeleteLoading(true);
		setDeleteNotice(null);
		try {
			await requestDeletion(authUser.userId, authUser.campusId ?? null);
			setDeleteNotice("Deletion request sent. Check your inbox for the confirmation link.");
		} catch (err) {
			const message = err instanceof Error ? err.message : "Unable to request deletion";
			setError(message);
		} finally {
			setDeleteLoading(false);
		}
	}, [profile, isDraftMode, deleteLoading, authUser]);

	const formSubmit = isDraftMode ? handleDraftSubmit : handleSubmit;
	const avatarUpload = isDraftMode ? handleDraftAvatarUpload : handleAvatarUpload;
	const deletionHandler = !isDraftMode ? handleRequestDeletion : undefined;
	const galleryImages = activeProfile?.gallery ?? [];
	const galleryDisabled = isDraftMode || !authUser;

	return (
		<main className="relative min-h-screen bg-gradient-to-br from-slate-100 via-white to-slate-200">
			<div className="pointer-events-none absolute inset-0 -z-10 bg-[radial-gradient(circle_at_top_right,_rgba(148,163,184,0.18),_transparent_60%)]" />
			<div className="mx-auto flex w-full max-w-5xl flex-col gap-6 px-6 py-12">
				<div className="flex items-center justify-between">
					<BrandLogo
						withWordmark
						logoWidth={96}
						logoHeight={96}
						className="inline-flex items-center gap-4 rounded-3xl border border-slate-200 bg-white/95 px-6 py-3 text-lg font-semibold text-slate-900 shadow-lg ring-1 ring-slate-100 transition hover:bg-white hover:text-slate-950"
						logoClassName="h-20 w-auto drop-shadow-[0_14px_35px_rgba(15,23,42,0.18)] saturate-[0.8] hue-rotate-[315deg] brightness-110"
					/>
				</div>
				<header className="flex flex-col gap-2">
					<p className="text-xs font-semibold uppercase tracking-[0.3em] text-slate-500">
						{isDraftMode ? "Profile launchpad" : "Profile settings"}
					</p>
					<h1 className="text-3xl font-semibold text-slate-900 sm:text-4xl">
						{isDraftMode ? "Craft your Divan identity" : "Shape your Divan identity"}
					</h1>
					<p className="text-sm text-slate-600 sm:text-base">
						{isDraftMode
							? "You have not signed in yet, so we saved a local workspace. Fill in your story now and we will sync it once your account is live."
							: "Manage how classmates discover you across Divan. Updates apply instantly to invites, rooms, and the Social Hub."}
					</p>
				</header>
				{isDraftMode ? (
					<div className="rounded-3xl border border-amber-200 bg-amber-50 px-5 py-4 text-sm text-amber-900 shadow-sm">
						<p className="font-semibold">We could not reach your live profile yet.</p>
						<p className="mt-1 text-amber-800">
							You have not launched an account, so we spun up a local workspace for you. Fill this in now and copy it over when you join Divan.
						</p>
						{error ? <p className="mt-2 text-xs text-amber-700">Details: {error}</p> : null}
						<button
							onClick={retryFetch}
							className="mt-3 w-fit rounded-full bg-white px-4 py-2 text-xs font-semibold text-amber-900 shadow hover:bg-amber-100"
						>
							Retry connection
						</button>
					</div>
				) : null}
				{!isDraftMode && error ? (
					<div className="rounded-3xl border border-rose-200 bg-rose-50 px-5 py-4 text-sm text-rose-700 shadow-sm">
						<p className="font-semibold">Something went wrong</p>
						<p className="mt-1 text-rose-600">{error}</p>
						<button
							onClick={retryFetch}
							className="mt-3 w-fit rounded-full bg-white px-4 py-2 text-xs font-semibold text-rose-700 shadow hover:bg-rose-100"
						>
							Retry
						</button>
					</div>
				) : null}
				{loading && !activeProfile ? (
					<p className="text-sm text-slate-500">Loading profile…</p>
				) : null}
				{deleteNotice ? (
					<p className="rounded-3xl border border-amber-200 bg-amber-50 px-5 py-3 text-sm text-amber-900">
						{deleteNotice}
					</p>
				) : null}
				{activeProfile ? (
					<div className="grid gap-6 lg:grid-cols-[minmax(0,1.75fr)_minmax(0,1fr)]">
						<section className="rounded-3xl border border-slate-200 bg-white/80 p-6 shadow-sm backdrop-blur">
							<ProfileForm
								profile={activeProfile}
								onSubmit={formSubmit}
								onAvatarUpload={avatarUpload}
								onRequestDeletion={deletionHandler}
								deleteLoading={deleteLoading}
								gallerySlot={(
									<ProfileGalleryManager
										images={galleryImages}
										onUpload={handleGalleryUpload}
										onRemove={handleGalleryRemove}
										uploading={galleryUploading}
										removingKey={galleryRemovingKey}
										error={galleryError}
										disabled={galleryDisabled}
										limit={6}
									/>
								)}
							/>
						</section>
						<aside className="flex flex-col gap-5">
							<section className="rounded-3xl border border-slate-200 bg-slate-900 px-5 py-6 text-white shadow-lg">
								<header className="flex items-center justify-between">
									<h2 className="text-sm font-semibold uppercase tracking-[0.2em] text-white/70">Profile preview</h2>
									<span className="text-xs text-white/60">Live draft</span>
								</header>
								<div className="mt-5 flex items-start gap-4">
									<div className="relative h-14 w-14 overflow-hidden rounded-full border border-white/40 bg-white/10">
										{activeProfile.avatar_url ? (
											<Image
												src={activeProfile.avatar_url}
												alt="Profile avatar preview"
												fill
												sizes="56px"
												className="object-cover"
												unoptimized
											/>
										) : (
											<div className="flex h-full w-full items-center justify-center text-xs font-semibold uppercase tracking-widest text-white/60">
												{(activeProfile.display_name || "You").slice(0, 2)}
											</div>
										)}
									</div>
									<div className="flex flex-col gap-2">
										<div>
											<p className="text-base font-semibold text-white">{activeProfile.display_name || "You"}</p>
											<p className="text-sm text-white/70">{activeProfile.handle ? `@${activeProfile.handle}` : "Handle pending"}</p>
										</div>
										<p className="text-sm text-white/70">
											{activeProfile.bio ? activeProfile.bio : "Introduce yourself to unlock campus highlights."}
										</p>
										{activeProfile.passions?.length ? (
											<ul className="flex flex-wrap gap-2 text-xs text-white/70">
												{activeProfile.passions.slice(0, 3).map((item) => (
													<li key={item.toLowerCase()} className="rounded-full bg-white/15 px-3 py-1">
														{item}
													</li>
												))}
											</ul>
										) : null}
										{activeProfile.status?.text ? (
											<p className="text-xs text-white/80">
												<span className="mr-1">{activeProfile.status.emoji || "💡"}</span>
												{activeProfile.status.text}
											</p>
										) : null}
									</div>
								</div>
							</section>
							<section className="rounded-3xl border border-slate-200 bg-white px-5 py-6 shadow-sm">
								<header className="flex items-center justify-between">
									<h2 className="text-sm font-semibold text-slate-900">Profile completeness</h2>
									<span className="text-sm font-semibold text-slate-600">{completion}%</span>
								</header>
								<div className="mt-4 flex h-2 w-full overflow-hidden rounded-full bg-slate-200">
									{Array.from({ length: PROGRESS_SEGMENTS }).map((_, index) => (
										<span
											key={index}
											className={`flex-1 transition-colors duration-300 ${
												index < activeSegments ? "bg-emerald-500" : "bg-transparent"
											}`}
										/>
									))}
								</div>
								<p className="mt-3 text-xs text-slate-500">
									Add your campus story to unlock more Social Hub entry points and richer recommendations.
								</p>
								{missingTasks.length ? (
									<ul className="mt-4 space-y-2 text-sm text-slate-600">
										{missingTasks.map((task) => (
											<li key={task} className="flex items-start gap-2">
												<span className="mt-1 inline-block h-1.5 w-1.5 rounded-full bg-emerald-500" />
												{task}
											</li>
										))}
									</ul>
								) : (
									<p className="mt-4 text-sm font-medium text-emerald-600">
										Great work—your profile is ready for the next wave of features.
									</p>
								)}
							</section>
							<section className="rounded-3xl border border-slate-200 bg-white px-5 py-6 shadow-sm">
								<h2 className="text-sm font-semibold text-slate-900">What you unlock next</h2>
								<ul className="mt-4 space-y-3 text-sm text-slate-600">
									{FEATURE_CALL_OUTS.map((feature) => (
										<li key={feature.title} className="rounded-2xl border border-slate-100 bg-slate-50 px-4 py-3">
											<p className="font-semibold text-slate-900">{feature.title}</p>
											<p className="mt-1 text-xs text-slate-600">{feature.description}</p>
										</li>
									))}
								</ul>
								{isDraftMode ? (
									<p className="mt-4 rounded-2xl border border-slate-100 bg-slate-50 px-4 py-3 text-xs text-slate-600">
										We save your draft locally. When you create an account, copy these details during onboarding to go live instantly.
									</p>
								) : (
									<p className="mt-4 text-xs text-slate-500">
										Invite friends once your profile hits 100% to unlock early-bird badges.
									</p>
								)}
							</section>
						</aside>
					</div>
				) : null}
			</div>
		</main>
	);
}
