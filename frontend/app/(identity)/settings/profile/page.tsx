"use client";

import Image from "next/image";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import BrandLogo from "@/components/BrandLogo";
import ProfileForm from "@/components/ProfileForm";
import {
	commitAvatar,
	commitGalleryImage,
	fetchProfile,
	patchProfile,
	presignAvatar,
	presignGallery,
	removeGalleryImage,
	HttpError,
	type PresignPayload,
	type ProfilePatchPayload,
} from "@/lib/identity";
import { onAuthChange, readAuthUser, type AuthUser } from "@/lib/auth-storage";
import { requestDeletion } from "@/lib/privacy";
import type { ProfileRecord } from "@/lib/types";
import { emitProfileMetric } from "@/lib/obs/profile";
import { useBeforeUnload } from "@/hooks/useBeforeUnload";
import { clearDraftProfile, createOfflineProfile, loadDraftFromStorage, resolveProfileContext, storeDraftProfile } from "./profile-support";

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
const AVATAR_QUEUE_STORAGE_KEY = "divan.profile.pending-avatar-uploads";
const MAX_PENDING_AVATARS = 3;
const MAX_GALLERY_ITEMS = 6;
const MAX_PROFILE_SAVE_ATTEMPTS = 3;
const RETRYABLE_STATUS_CODES = new Set([408, 425, 429, 500, 502, 503, 504]);

function delay(ms: number): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, ms));
}
async function uploadAvatar(url: string, file: File, metadata?: Record<string, string>): Promise<void> {
	const response = await fetch(url, {
		method: "PUT",
		headers: {
			"Content-Type": file.type || "application/octet-stream",
			...(metadata ?? {}),
		},
		body: file,
	});
	if (!response.ok) {
		throw new Error(`Avatar upload failed (${response.status})`);
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

const PROFILE_COMPARE_FIELDS: Array<keyof ProfileRecord> = [
	"bio",
	"handle",
	"major",
	"graduation_year",
	"passions",
	"privacy",
	"status",
	"avatar_key",
	"avatar_url",
	"gallery",
];

const FIELD_LABELS: Record<string, string> = {
	bio: "Bio",
	handle: "Username",
	major: "Major",
	graduation_year: "Graduation year",
	passions: "Passions",
	privacy: "Privacy settings",
	status: "Status",
	avatar_key: "Avatar",
	avatar_url: "Avatar",
	gallery: "Gallery",
};

function profilesEqual(a: ProfileRecord | null, b: ProfileRecord | null): boolean {
	if (!a || !b) {
		return false;
	}
	return PROFILE_COMPARE_FIELDS.every((field) => {
		const lhs = (a as Record<string, unknown>)[field];
		const rhs = (b as Record<string, unknown>)[field];
		return JSON.stringify(lhs) === JSON.stringify(rhs);
	});
}

function describeFieldList(fields: string[]): string[] {
	const unique = Array.from(new Set(fields));
	return unique.map((field) => FIELD_LABELS[field] ?? field);
}

function buildPatchFromDraft(base: ProfileRecord, draft: ProfileRecord): ProfilePatchPayload {
	const patch: ProfilePatchPayload = {};
	if ((draft.bio ?? "").trim() !== (base.bio ?? "").trim()) {
		patch.bio = draft.bio ?? "";
	}
	if ((draft.handle ?? "").trim() && draft.handle !== base.handle) {
		patch.handle = draft.handle ?? undefined;
	}
	if (JSON.stringify(draft.privacy) !== JSON.stringify(base.privacy)) {
		patch.privacy = draft.privacy;
	}
	if (JSON.stringify(draft.status) !== JSON.stringify(base.status)) {
		patch.status = {
			text: draft.status?.text ?? "",
			emoji: draft.status?.emoji ?? "",
		};
	}
	if ((draft.major ?? "").trim() !== (base.major ?? "").trim()) {
		patch.major = draft.major ?? null;
	}
	if ((draft.graduation_year ?? null) !== (base.graduation_year ?? null)) {
		patch.graduation_year = draft.graduation_year ?? null;
	}
	if (JSON.stringify(draft.passions ?? []) !== JSON.stringify(base.passions ?? [])) {
		patch.passions = draft.passions ?? [];
	}
	return patch;
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

type PendingAvatarUpload = {
	userId: string;
	campusId: string | null;
	mime: string;
	dataUrl: string;
	storedAt: number;
};

function readPendingAvatarUploads(): PendingAvatarUpload[] {
	if (typeof window === "undefined") {
		return [];
	}
	try {
		const raw = window.localStorage.getItem(AVATAR_QUEUE_STORAGE_KEY);
		if (!raw) {
			return [];
		}
		const parsed = JSON.parse(raw);
		if (!Array.isArray(parsed)) {
			return [];
		}
		return parsed
			.map((item) => {
				if (
					!item ||
					typeof item !== "object" ||
					typeof item.userId !== "string" ||
					typeof item.dataUrl !== "string" ||
					typeof item.mime !== "string"
				) {
					return null;
				}
				return {
					userId: item.userId,
					campusId: typeof item.campusId === "string" ? item.campusId : null,
					mime: item.mime,
					dataUrl: item.dataUrl,
					storedAt: typeof item.storedAt === "number" ? item.storedAt : Date.now(),
				} satisfies PendingAvatarUpload;
			})
			.filter((item): item is PendingAvatarUpload => Boolean(item));
	} catch (err) {
		if (process.env.NODE_ENV !== "production") {
			console.warn("[settings/profile] Failed to read pending avatar queue", err);
		}
		return [];
	}
}

function storePendingAvatarUploads(queue: PendingAvatarUpload[]): void {
	if (typeof window === "undefined") {
		return;
	}
	try {
		if (queue.length === 0) {
			window.localStorage.removeItem(AVATAR_QUEUE_STORAGE_KEY);
			return;
		}
		const limited = queue.slice(-MAX_PENDING_AVATARS);
		window.localStorage.setItem(AVATAR_QUEUE_STORAGE_KEY, JSON.stringify(limited));
	} catch (err) {
		if (process.env.NODE_ENV !== "production") {
			console.warn("[settings/profile] Failed to persist pending avatar queue", err);
		}
	}
}

function enqueuePendingAvatarUpload(item: PendingAvatarUpload): void {
	const existing = readPendingAvatarUploads();
	existing.push(item);
	storePendingAvatarUploads(existing);
}

function isFetchFailure(error: unknown): boolean {
	if (error instanceof TypeError) {
		return true;
	}
	if (error instanceof Error) {
		return error.message.includes("Failed to fetch");
	}
	return false;
}

function isRetryableSaveError(error: unknown): boolean {
	if (isFetchFailure(error)) {
		return true;
	}
	if (error instanceof HttpError) {
		return RETRYABLE_STATUS_CODES.has(error.status);
	}
	return false;
}

function mapHttpErrorStatusMessage(error: HttpError): string {
	switch (error.status) {
		case 401:
			return "Session expired. Please sign in again.";
		case 403:
			return error.message || "You do not have permission to update this profile.";
		case 404:
			return "Profile not found.";
		case 409:
			return error.message || "That username is already taken. Try another handle.";
		case 422:
			return error.message || "Some profile fields still need attention.";
		default:
			if (RETRYABLE_STATUS_CODES.has(error.status)) {
				return error.message || "The server did not respond. Please try again in a moment.";
			}
			return error.message || "Profile update failed. Please try again.";
	}
}

function normaliseRemoteProfile(record: ProfileRecord): ProfileRecord {
	const passions = Array.isArray(record.passions) ? record.passions : [];
	const gallery = Array.isArray(record.gallery)
		? record.gallery.filter(
			(item): item is ProfileRecord["gallery"][number] =>
				Boolean(item && typeof item.key === "string" && typeof item.url === "string"),
		  )
		: [];
	return {
		...record,
		passions,
		gallery,
	};
}

export default function ProfileSettingsPage() {
	const [authUser, setAuthUser] = useState<AuthUser | null>(null);
	const [authHydrated, setAuthHydrated] = useState<boolean>(false);
	const [profile, setProfile] = useState<ProfileRecord | null>(null);
	const [draftProfile, setDraftProfile] = useState<ProfileRecord | null>(null);
	const [loading, setLoading] = useState<boolean>(true);
	const [error, setError] = useState<string | null>(null);
	const [reloadToken, setReloadToken] = useState<number>(0);
	const [deleteNotice, setDeleteNotice] = useState<string | null>(null);
	const [deleteLoading, setDeleteLoading] = useState<boolean>(false);
	const [pendingDraft, setPendingDraft] = useState<ProfileRecord | null>(null);
	const [showDraftSyncPrompt, setShowDraftSyncPrompt] = useState<boolean>(false);
	const [hasUnsyncedChanges, setHasUnsyncedChanges] = useState<boolean>(false);
	const [lastChangedFields, setLastChangedFields] = useState<string[]>([]);
	const [draftSyncLoading, setDraftSyncLoading] = useState<boolean>(false);
	const [isOnline, setIsOnline] = useState<boolean>(true);
	const [galleryUploading, setGalleryUploading] = useState<boolean>(false);
	const [galleryError, setGalleryError] = useState<string | null>(null);
	const [galleryRemoving, setGalleryRemoving] = useState<string | null>(null);

	const adoptRemoteProfile = useCallback((next: ProfileRecord): ProfileRecord => {
		const normalised = normaliseRemoteProfile(next);
		setProfile(normalised);
		setDraftProfile(null);
		storeDraftProfile(normalised);
		return normalised;
	}, []);

	useEffect(() => {
		if (typeof window === "undefined") {
			return;
		}
		setAuthUser(readAuthUser());
		setAuthHydrated(true);
		const cleanup = onAuthChange(() => setAuthUser(readAuthUser()));
		setIsOnline(window.navigator.onLine);
		const handleOnline = () => setIsOnline(true);
		const handleOffline = () => setIsOnline(false);
		window.addEventListener("online", handleOnline);
		window.addEventListener("offline", handleOffline);
		return () => {
			cleanup();
			window.removeEventListener("online", handleOnline);
			window.removeEventListener("offline", handleOffline);
		};
	}, []);


	const profileTarget = useMemo(() => resolveProfileContext(authUser), [authUser]);
	const targetUserId = profileTarget.userId;
	const targetCampusId = profileTarget.campusId;
	const targetMode = profileTarget.mode;
	const isDemoMode = targetMode === "demo";

	useBeforeUnload(hasUnsyncedChanges, "You have unsynced profile changes. Do you want to leave without saving?");

	const isDraftMode = profile === null && draftProfile !== null;
	const isDemoDraft = isDraftMode && isDemoMode;
	const activeProfile = profile ?? draftProfile;
	const completion = useMemo(() => (activeProfile ? calculateCompletion(activeProfile) : 0), [activeProfile]);
	const activeSegments = useMemo(() => {
		const clamped = Math.min(Math.max(completion, 0), 100);
		return Math.round((clamped / 100) * PROGRESS_SEGMENTS);
	}, [completion]);
	const missingTasks = useMemo(() => (activeProfile ? buildMissingTasks(activeProfile) : []), [activeProfile]);
	const pendingDraftFields = useMemo(() => {
		if (!profile || !pendingDraft) {
			return [] as string[];
		}
		const patch = buildPatchFromDraft(profile, pendingDraft);
		return Object.keys(patch);
	}, [profile, pendingDraft]);
	const pendingDraftFieldLabels = useMemo(() => describeFieldList(pendingDraftFields), [pendingDraftFields]);
	const unsyncedFieldLabels = useMemo(() => describeFieldList(lastChangedFields), [lastChangedFields]);
	const showDraftNotice = !loading && isDemoDraft;
	const showLiveErrorNotice = !loading && isDraftMode && !isDemoMode;
	const modeBadge = targetMode === "live" ? "Live profile" : "Demo workspace";
	const modeTone = targetMode === "live"
		? { container: "bg-slate-900 text-white", dot: "bg-emerald-400" }
		: { container: "bg-slate-700 text-white", dot: "bg-sky-300" };
	const statusBadge = (() => {
		if (targetMode !== "live") {
			return isDemoDraft ? "Local only" : isOnline ? "Connected" : "Offline";
		}
		if (!isOnline) {
			return "Offline";
		}
		if (loading) {
			return "Syncing";
		}
		if (hasUnsyncedChanges) {
			return "Unsynced changes";
		}
		return "Up to date";
	})();
	const statusTone = (() => {
		if (!isOnline) {
			return { container: "bg-slate-200 text-slate-700", dot: "bg-slate-500" };
		}
		if (hasUnsyncedChanges) {
			return { container: "bg-amber-100 text-amber-900", dot: "bg-amber-500" };
		}
		return { container: "bg-emerald-100 text-emerald-800", dot: "bg-emerald-500" };
	})();

	useEffect(() => {
		if (!authHydrated || targetMode !== "live") {
			return;
		}
		if (pendingDraft) {
			return;
		}
		const stored = loadDraftFromStorage(targetUserId, targetCampusId);
		if (!stored) {
			return;
		}
		if (profile && profilesEqual(profile, stored)) {
			return;
		}
		setPendingDraft(stored);
		setShowDraftSyncPrompt(true);
		emitProfileMetric({ event: "draft_sync", action: "remind" });
	}, [authHydrated, targetMode, targetUserId, targetCampusId, profile, pendingDraft]);

	const flushingPendingRef = useRef(false);

	const flushPendingAvatarUploads = useCallback(async () => {
		if (typeof window === "undefined") {
			return;
		}
		if (flushingPendingRef.current) {
			return;
		}
		const pending = readPendingAvatarUploads();
		if (!pending.length) {
			return;
		}
		flushingPendingRef.current = true;
		try {
			const remaining: PendingAvatarUpload[] = [];
			for (let index = 0; index < pending.length; index += 1) {
				const item = pending[index];
				if (item.userId !== targetUserId) {
					remaining.push(item);
					continue;
				}
				try {
					const response = await fetch(item.dataUrl);
					const blob = await response.blob();
					const file = new File([blob], `avatar-${Date.now()}`, { type: item.mime || blob.type || "application/octet-stream" });
					const payload: PresignPayload = { mime: file.type, bytes: file.size };
					const presigned = await presignAvatar(item.userId, item.campusId, payload);
					await uploadAvatar(presigned.url, file);
					const updated = await commitAvatar(item.userId, item.campusId, presigned.key);
					if (item.userId === targetUserId) {
						adoptRemoteProfile(updated);
					}
				} catch (err) {
					if (process.env.NODE_ENV !== "production") {
						console.warn("[settings/profile] Pending avatar retry failed", err);
					}
					remaining.push(item, ...pending.slice(index + 1));
					break;
				}
			}
			storePendingAvatarUploads(remaining);
		} finally {
			flushingPendingRef.current = false;
		}
	}, [adoptRemoteProfile, targetUserId]);

	useEffect(() => {
		if (!authHydrated) {
			return;
		}
		if (typeof window === "undefined") {
			return;
		}
		const attempt = () => {
			if (navigator.onLine) {
				void flushPendingAvatarUploads();
			}
		};
		void attempt();
		window.addEventListener("online", attempt);
		return () => {
			window.removeEventListener("online", attempt);
		};
	}, [authHydrated, flushPendingAvatarUploads]);

	useEffect(() => {
		if (!authHydrated) {
			if (process.env.NODE_ENV !== "production") {
				console.info("[settings/profile] Waiting for auth hydration");
			}
			return;
		}
		let cancelled = false;
		async function loadProfile() {
			setLoading(true);
			const target = { userId: targetUserId, campusId: targetCampusId, mode: targetMode };
			if (process.env.NODE_ENV !== "production") {
				console.info("[settings/profile] Fetching profile", target);
			}
			try {
				for (let attempt = 0; attempt < 2; attempt += 1) {
					try {
						const record = await fetchProfile(target.userId, target.campusId);
						if (!cancelled) {
							adoptRemoteProfile(record);
							setError(null);
							if (process.env.NODE_ENV !== "production") {
								console.info("[settings/profile] Profile fetch success", {
									id: record.id,
									mode: target.mode,
								});
							}
						}
						return;
					} catch (err) {
						if (attempt === 0 && isFetchFailure(err)) {
							if (process.env.NODE_ENV !== "production") {
								console.warn("[settings/profile] Profile fetch transient failure, retrying", {
									mode: target.mode,
									message: err instanceof Error ? err.message : "unknown",
								});
							}
							await new Promise((resolve) => setTimeout(resolve, 750));
							continue;
						}
						throw err;
					}
				}
			} catch (err) {
				if (!cancelled) {
					const rawMessage = err instanceof Error ? err.message : null;
					const displayMessage = rawMessage && rawMessage !== "Failed to fetch" ? rawMessage : null;
					setProfile(null);
					setDraftProfile(
						loadDraftFromStorage(target.userId, target.campusId) ??
							createOfflineProfile(target.userId, target.campusId),
					);
					setError(displayMessage);
					if (process.env.NODE_ENV !== "production") {
						console.warn("[settings/profile] Profile fetch failed", {
							message: rawMessage ?? "unknown",
							mode: target.mode,
						});
					}
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
	}, [authHydrated, targetUserId, targetCampusId, targetMode, reloadToken, adoptRemoteProfile]);

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
		if (targetMode !== "live" || showDraftSyncPrompt || pendingDraft) {
			return;
		}
		clearDraftProfile();
	}, [profile, targetMode, showDraftSyncPrompt, pendingDraft]);

	const handleSubmit = useCallback(async (patch: ProfilePatchPayload) => {
		const changedFields = Object.keys(patch);
		let attempt = 0;
		let lastError: unknown = null;
		while (attempt < MAX_PROFILE_SAVE_ATTEMPTS) {
			attempt += 1;
			try {
				const updated = await patchProfile(targetUserId, targetCampusId, patch);
				if (changedFields.length) {
					emitProfileMetric({ event: "profile_save", mode: targetMode, changedFields });
					setHasUnsyncedChanges(false);
					setLastChangedFields([]);
					setError(null);
				}
				return adoptRemoteProfile(updated);
			} catch (err) {
				lastError = err;
				const retryable = attempt < MAX_PROFILE_SAVE_ATTEMPTS && isRetryableSaveError(err);
				if (process.env.NODE_ENV !== "production") {
					const status = err instanceof HttpError ? err.status : null;
					console.error("[settings/profile] Profile save attempt failed", {
						attempt,
						maxAttempts: MAX_PROFILE_SAVE_ATTEMPTS,
						changedFields,
						status,
						message: err instanceof Error ? err.message : String(err),
						details: err instanceof HttpError ? err.details : undefined,
						retryable,
					});
				}
				if (retryable) {
					await delay(400 * attempt);
					continue;
				}
				if (isFetchFailure(err)) {
					const baseRecord = pendingDraft ?? profile ?? draftProfile ?? createOfflineProfile(targetUserId, targetCampusId);
					const optimistic = applyProfilePatch(baseRecord, patch);
					storeDraftProfile(optimistic);
					setPendingDraft(optimistic);
					setShowDraftSyncPrompt(true);
					setHasUnsyncedChanges(true);
					setLastChangedFields((prev) => {
						const merged = new Set([...prev, ...changedFields]);
						return Array.from(merged);
					});
					emitProfileMetric({ event: "profile_save", mode: targetMode, changedFields });
					const message = "Server unreachable. We saved your changes locally—you can retry once you're back online.";
					setError(message);
					throw new Error(message);
				}
				if (err instanceof HttpError) {
					const message = mapHttpErrorStatusMessage(err);
					setError(message);
					throw new Error(message);
				}
				throw err instanceof Error ? err : new Error("Profile update failed");
			}
		}
		if (lastError instanceof Error) {
			throw lastError;
		}
		throw new Error("Profile update failed");
	}, [adoptRemoteProfile, draftProfile, pendingDraft, profile, targetCampusId, targetMode, targetUserId]);

	const handleAvatarUpload = useCallback(
		async (file: File) => {
			const payload: PresignPayload = { mime: file.type || "application/octet-stream", bytes: file.size };
			const presigned = await presignAvatar(targetUserId, targetCampusId, payload);
			try {
				await uploadAvatar(presigned.url, file);
			} catch (err) {
				if (process.env.NODE_ENV !== "production") {
					console.error("[settings/profile] Avatar upload request failed", {
						error: err,
						mode: targetMode,
						userId: targetUserId,
						campusId: targetCampusId,
					});
				}
				if (isFetchFailure(err)) {
					const dataUrl = await readFileAsDataUrl(file);
					enqueuePendingAvatarUpload({
						userId: targetUserId,
						campusId: targetCampusId,
						mime: payload.mime,
						dataUrl,
						storedAt: Date.now(),
					});
					const optimistic: ProfileRecord = profile
						? {
							...profile,
							avatar_url: dataUrl,
							avatar_key: profile.avatar_key ?? `local-${Date.now()}`,
						}
						: {
							...createOfflineProfile(targetUserId, targetCampusId),
							avatar_url: dataUrl,
							avatar_key: `local-${Date.now()}`,
						};
					setProfile(optimistic);
					emitProfileMetric({ event: "avatar_upload", mode: targetMode, outcome: "queued" });
					setHasUnsyncedChanges(true);
					setLastChangedFields((prev) => (prev.includes("avatar_url") ? prev : [...prev, "avatar_url"]));
					throw new Error("We saved your photo locally and will retry once the connection is back.");
				}
				emitProfileMetric({ event: "avatar_upload", mode: targetMode, outcome: "failed" });
				throw err instanceof Error ? err : new Error("Avatar upload failed");
			}
			const updated = await commitAvatar(targetUserId, targetCampusId, presigned.key);
			emitProfileMetric({ event: "avatar_upload", mode: targetMode, outcome: "success" });
			return adoptRemoteProfile(updated);
		},
		[adoptRemoteProfile, profile, targetCampusId, targetMode, targetUserId],
	);

	const handleGalleryUpload = useCallback(
		async (file: File) => {
			const active = (profile ?? draftProfile)?.gallery ?? [];
			if (active.length >= MAX_GALLERY_ITEMS) {
				const err = new Error("Gallery is full. Remove a photo before adding another.");
				setGalleryError(err.message);
				throw err;
			}
			const payload: PresignPayload = { mime: file.type || "application/octet-stream", bytes: file.size };
			setGalleryError(null);
			setGalleryUploading(true);
			try {
				const presigned = await presignGallery(targetUserId, targetCampusId, payload);
				await uploadAvatar(presigned.url, file);
				const updated = await commitGalleryImage(targetUserId, targetCampusId, presigned.key);
				return adoptRemoteProfile(updated);
			} catch (err) {
				if (process.env.NODE_ENV !== "production") {
					console.error("[settings/profile] Gallery upload failed", err);
				}
				const message = isFetchFailure(err)
					? "Connection issue: please try uploading again once you are back online."
					: err instanceof Error
					? err.message
					: "Unable to upload photo";
				setGalleryError(message);
				throw err instanceof Error ? err : new Error(message);
			} finally {
				setGalleryUploading(false);
			}
		},
		[adoptRemoteProfile, draftProfile, profile, targetCampusId, targetUserId],
	);

	const handleGalleryRemove = useCallback(
		async (key: string) => {
			setGalleryError(null);
			setGalleryRemoving(key);
			try {
				const updated = await removeGalleryImage(targetUserId, targetCampusId, key);
				return adoptRemoteProfile(updated);
			} catch (err) {
				if (process.env.NODE_ENV !== "production") {
					console.error("[settings/profile] Gallery removal failed", err);
				}
				const message = err instanceof Error ? err.message : "Unable to remove photo";
				setGalleryError(message);
				throw err instanceof Error ? err : new Error(message);
			} finally {
				setGalleryRemoving(null);
			}
		},
		[adoptRemoteProfile, targetCampusId, targetUserId],
	);

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
		const changedFields = Object.keys(patch);
		if (changedFields.length) {
			emitProfileMetric({ event: "profile_save", mode: targetMode, changedFields });
		}
		return result;
	}, [targetMode]);

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
		const resolved = result;
		if (!resolved) {
			throw new Error("Unable to update draft avatar");
		}
		const resolvedRecord = resolved as ProfileRecord;
		if (process.env.NODE_ENV !== "production") {
			console.info("[settings/profile] Draft avatar saved", {
				avatarKey: resolvedRecord.avatar_key ?? null,
				avatarUrl: resolvedRecord.avatar_url ?? null,
			});
		}
		emitProfileMetric({ event: "avatar_upload", mode: targetMode, outcome: "queued" });
		return resolvedRecord;
	}, [targetMode]);

	const handleDraftGalleryUpload = useCallback(async (file: File) => {
		const dataUrl = await readFileAsDataUrl(file);
		let result: ProfileRecord | null = null;
		setDraftProfile((prev) => {
			if (!prev) {
				return prev;
			}
			const entry = {
				key: `local-${Date.now()}`,
				url: dataUrl,
				uploaded_at: new Date().toISOString(),
			};
			const existing = Array.isArray(prev.gallery) ? prev.gallery : [];
			const gallery = [entry, ...existing].slice(0, MAX_GALLERY_ITEMS);
			const updated: ProfileRecord = {
				...prev,
				gallery,
			};
			result = updated;
			return updated;
		});
		if (!result) {
			throw new Error("Unable to update draft gallery");
		}
		return result;
	}, []);

	const handleDraftGalleryRemove = useCallback(async (key: string) => {
		let result: ProfileRecord | null = null;
		setDraftProfile((prev) => {
			if (!prev) {
				return prev;
			}
			const existing = Array.isArray(prev.gallery) ? prev.gallery : [];
			const gallery = existing.filter((item) => item.key !== key);
			const updated: ProfileRecord = {
				...prev,
				gallery,
			};
			result = updated;
			return updated;
		});
		if (!result) {
			throw new Error("Unable to update draft gallery");
		}
		return result;
	}, []);

	useEffect(() => {
		if (isDraftMode) {
			setHasUnsyncedChanges(false);
			setLastChangedFields([]);
		}
	}, [isDraftMode]);

	const handleDirtyChange = useCallback(
		(dirty: boolean, fields: string[]) => {
			if (isDraftMode) {
				return;
			}
			if (!dirty && pendingDraft) {
				return;
			}
			setHasUnsyncedChanges(dirty);
			setLastChangedFields(fields);
		},
		[isDraftMode, pendingDraft],
	);

	const retryFetch = useCallback(() => {
		setReloadToken((prev) => prev + 1);
	}, []);

	const dismissDraftPrompt = useCallback((forgetDraft: boolean = false) => {
		setShowDraftSyncPrompt(false);
		if (forgetDraft) {
			setPendingDraft(null);
		}
	}, []);

	const handleSnoozePendingDraft = useCallback(() => {
		dismissDraftPrompt();
	}, [dismissDraftPrompt]);

	const reopenDraftPrompt = useCallback(() => {
		setShowDraftSyncPrompt(true);
	}, []);

	const handleDiscardPendingDraft = useCallback(() => {
		clearDraftProfile();
		dismissDraftPrompt(true);
		emitProfileMetric({ event: "draft_sync", action: "discard" });
	}, [dismissDraftPrompt]);

	const handleMergePendingDraft = useCallback(async () => {
		if (!pendingDraft || !profile || targetMode !== "live") {
			return;
		}
		const patch = buildPatchFromDraft(profile, pendingDraft);
		if (Object.keys(patch).length === 0) {
			clearDraftProfile();
			dismissDraftPrompt(true);
			return;
		}
		setDraftSyncLoading(true);
		try {
			const updated = await patchProfile(targetUserId, targetCampusId, patch);
			const changedFields = Object.keys(patch);
			if (changedFields.length) {
				emitProfileMetric({ event: "profile_save", mode: targetMode, changedFields });
			}
			adoptRemoteProfile(updated);
			setHasUnsyncedChanges(false);
			setLastChangedFields([]);
			clearDraftProfile();
			dismissDraftPrompt(true);
			emitProfileMetric({ event: "draft_sync", action: "merge" });
		} catch (err) {
			console.error("[settings/profile] Failed to merge local draft", err);
		} finally {
			setDraftSyncLoading(false);
		}
	}, [adoptRemoteProfile, pendingDraft, profile, targetMode, targetUserId, targetCampusId, dismissDraftPrompt]);

	const handleRequestDeletion = useCallback(async () => {
		if (!profile || isDraftMode || deleteLoading) {
			if (isDraftMode) {
				setDeleteNotice("Account deletion is available after you create and verify your Divan account.");
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
			await requestDeletion(targetUserId, targetCampusId);
			setDeleteNotice("Deletion request sent. Check your inbox for the confirmation link.");
		} catch (err) {
			const message = err instanceof Error ? err.message : "Unable to request deletion";
			setError(message);
		} finally {
			setDeleteLoading(false);
		}
		}, [profile, isDraftMode, deleteLoading, targetUserId, targetCampusId]);

	const formSubmit = isDraftMode ? handleDraftSubmit : handleSubmit;
	const avatarUpload = isDraftMode ? handleDraftAvatarUpload : handleAvatarUpload;
	const galleryUpload = isDraftMode ? handleDraftGalleryUpload : handleGalleryUpload;
	const galleryRemove = isDraftMode ? handleDraftGalleryRemove : handleGalleryRemove;
	const deletionHandler = !isDraftMode ? handleRequestDeletion : undefined;

	return (
		<main className="relative min-h-screen bg-gradient-to-br from-slate-100 via-white to-slate-200">
			<div className="pointer-events-none absolute inset-0 -z-10 bg-[radial-gradient(circle_at_top_right,_rgba(148,163,184,0.18),_transparent_60%)]" />
			<div className="mx-auto flex w-full max-w-5xl flex-col gap-6 px-6 py-12">
				<div className="flex items-center justify-between">
					<BrandLogo
						withWordmark
						className="rounded-full bg-white/80 px-4 py-2 text-sm font-semibold text-slate-900 shadow-sm ring-1 ring-inset ring-slate-200 transition hover:bg-white hover:text-slate-950"
					/>
				</div>
				<header className="flex flex-col gap-2">
					<p className="text-xs font-semibold uppercase tracking-[0.3em] text-slate-500">
						{isDemoDraft ? "Profile launchpad" : "Profile settings"}
					</p>
					<h1 className="text-3xl font-semibold text-slate-900 sm:text-4xl">
						{isDemoDraft ? "Craft your Divan identity" : "Shape your Divan identity"}
					</h1>
					<p className="text-sm text-slate-600 sm:text-base">
						{isDemoDraft
							? "You have not signed in yet, so we saved a local workspace. Fill in your story now and we will sync it once your account is live."
							: "Manage how classmates discover you across Divan. Updates apply instantly to invites, rooms, and the Social Hub."}
					</p>
					<div className="mt-3 flex flex-wrap gap-2 text-xs font-semibold">
						<span className={`inline-flex items-center gap-2 rounded-full px-3 py-1 ${modeTone.container}`}>
							<span className={`h-1.5 w-1.5 rounded-full ${modeTone.dot}`} />
							{modeBadge}
						</span>
						<span className={`inline-flex items-center gap-2 rounded-full px-3 py-1 ${statusTone.container}`}>
							<span className={`h-1.5 w-1.5 rounded-full ${statusTone.dot}`} />
							{statusBadge}
						</span>
					</div>
				</header>
				{!isDraftMode && hasUnsyncedChanges ? (
					<div className="rounded-3xl border border-amber-200 bg-amber-50 px-5 py-4 text-xs text-amber-900 shadow-sm">
						<p className="text-sm font-semibold">Unsaved changes</p>
						{unsyncedFieldLabels.length ? (
							<p className="mt-1 text-amber-800">
								Updated: {unsyncedFieldLabels.join(", ")}
							</p>
						) : null}
						<p className="mt-2 text-[0.7rem] text-amber-700">
							Save to publish these updates to your live profile.
						</p>
					</div>
				) : null}
				{showDraftSyncPrompt && pendingDraft && profile ? (
					<section className="rounded-3xl border border-sky-200 bg-sky-50 px-5 py-4 text-sm text-sky-900 shadow-sm">
						<div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
							<div className="flex-1">
								<p className="font-semibold">We found updates saved while you were offline.</p>
								<p className="mt-1 text-sky-800">
									Sync now to bring these details back to your live profile.
								</p>
								{pendingDraftFieldLabels.length ? (
									<ul className="mt-2 flex flex-wrap gap-2 text-xs text-sky-800">
										{pendingDraftFieldLabels.map((label) => (
											<li key={label} className="rounded-full bg-white/70 px-3 py-1 font-medium text-sky-900">
												{label}
											</li>
										))}
									</ul>
								) : null}
							</div>
							<div className="flex w-full flex-col gap-2 sm:w-52">
								<button
									onClick={handleMergePendingDraft}
									disabled={draftSyncLoading}
									className="rounded-full bg-sky-600 px-4 py-2 text-xs font-semibold text-white shadow transition hover:bg-sky-500 disabled:cursor-not-allowed disabled:opacity-60"
								>
									{draftSyncLoading ? "Syncing…" : "Retry now"}
								</button>
								<button
									onClick={handleSnoozePendingDraft}
									disabled={draftSyncLoading}
									className="rounded-full border border-sky-200 bg-white px-4 py-2 text-xs font-semibold text-sky-700 transition hover:bg-sky-100 disabled:cursor-not-allowed disabled:opacity-60"
								>
									Remind me later
								</button>
								<button
									onClick={handleDiscardPendingDraft}
									disabled={draftSyncLoading}
									className="rounded-full border border-rose-200 bg-white px-4 py-2 text-xs font-semibold text-rose-600 transition hover:bg-rose-50 disabled:cursor-not-allowed disabled:opacity-60"
								>
									Discard draft
								</button>
							</div>
						</div>
					</section>
				) : null}
				{pendingDraft && profile && !showDraftSyncPrompt ? (
					<button
						onClick={reopenDraftPrompt}
						className="w-fit rounded-full border border-sky-200 bg-white px-4 py-2 text-xs font-semibold text-sky-700 shadow-sm transition hover:bg-sky-50"
					>
						Review saved offline draft
					</button>
				) : null}
				{showDraftNotice ? (
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
				{showLiveErrorNotice ? (
					<div className="rounded-3xl border border-rose-200 bg-rose-50 px-5 py-4 text-sm text-rose-700 shadow-sm">
						<p className="font-semibold">We hit a snag reaching your live profile.</p>
						<p className="mt-1 text-rose-600">
							{error ?? "Please retry in a moment. Your changes will save once we reconnect."}
						</p>
						<button
							onClick={retryFetch}
							className="mt-3 w-fit rounded-full bg-white px-4 py-2 text-xs font-semibold text-rose-700 shadow hover:bg-rose-100"
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
								onGalleryUpload={galleryUpload}
								onGalleryRemove={galleryRemove}
								onRequestDeletion={deletionHandler}
								deleteLoading={deleteLoading}
								onDirtyChange={handleDirtyChange}
								galleryUploading={galleryUploading}
								galleryRemovingKey={galleryRemoving}
								galleryError={galleryError}
								galleryLimit={MAX_GALLERY_ITEMS}
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
