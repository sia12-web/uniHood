"use client";

import Image from "next/image";
import { useCallback, useContext, useEffect, useId, useMemo, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { User, Image as ImageIcon, BookOpen, Settings } from "lucide-react";

import ProfileForm from "@/components/ProfileForm";
import ProfileGalleryManager from "@/components/ProfileGalleryManager";
import WebsiteSettings from "@/components/WebsiteSettings";
import {
	commitAvatar,
	commitGallery,
	fetchProfile,
	fetchUserCourses,
	patchProfile,
	presignAvatar,
	presignGallery,
	removeGalleryImage,
	saveProfileCourses,
	type PresignPayload,
	type ProfilePatchPayload,
	type ProfileCourseInput,
} from "@/lib/identity";
import { forceDeleteAccount } from "@/lib/privacy";
import { useRouter } from "next/navigation";
import { getDemoCampusId, getDemoUserId } from "@/lib/env";
import { onAuthChange, readAuthUser, readAuthSnapshot, storeAuthSnapshot, type AuthUser } from "@/lib/auth-storage";
import type { ProfileCourse, ProfileRecord } from "@/lib/types";
import { ToastContext } from "@/components/providers/toast-provider";

const DEMO_USER_ID = getDemoUserId();
const DEMO_CAMPUS_ID = getDemoCampusId();
const DRAFT_STORAGE_KEY = "unihood.profile.draft";
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
	courses?: ProfileRecord["courses"];
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
		email: "",
		email_verified: false,
		handle: "",
		display_name: "New to Campus",
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
		courses: [],
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
		courses: Array.isArray(candidate.courses)
			? candidate.courses.filter((item): item is ProfileCourse =>
				Boolean(item) && typeof (item as ProfileCourse).name === "string" && (item as ProfileCourse).name.trim().length > 0,
			)
			: base.courses,
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
		courses: profile.courses ?? [],
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
		courses: patch.courses
			? patch.courses.map((code) => ({ name: code, code: code }))
			: base.courses ?? [],
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
	const passionsCount = profile.passions?.length ?? 0;
	const major = (profile.major ?? "").trim();
	const checks = [
		Boolean(profile.avatar_url),
		bio.length >= 40,
		Boolean(major),
		Boolean(profile.graduation_year),
		passionsCount >= 3,
	];
	const filled = checks.filter(Boolean).length;
	return Math.round((filled / checks.length) * 100);
}

function buildMissingTasks(profile: ProfileRecord): string[] {
	const tasks: string[] = [];
	const bio = (profile.bio ?? "").trim();
	const major = (profile.major ?? "").trim();
	const passionsCount = profile.passions?.length ?? 0;
	if (bio.length < 40) {
		tasks.push("Write a bio (40+ chars) that spotlights what you want to work on.");
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
	return tasks.slice(0, 4);
}

type CourseItem = {
	_localId: string;
	id?: string;
	name: string;
	code: string;
	term: string;
};

type CourseFormState = {
	name: string;
	code: string;
	term: string;
};

function emptyCourseForm(): CourseFormState {
	return { name: "", code: "", term: "" };
}

function randomLocalId(seed?: string): string {
	if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
		return crypto.randomUUID();
	}
	const suffix = Math.random().toString(16).slice(2, 10);
	return `course-${Date.now()}-${suffix}${seed ? `-${seed}` : ""}`;
}

function toCourseItems(source: ProfileCourse[] | undefined | null): CourseItem[] {
	return (source ?? [])
		.filter((candidate): candidate is ProfileCourse =>
			Boolean(candidate) && typeof candidate.name === "string" && candidate.name.trim().length > 0,
		)
		.map((course, index) => ({
			_localId: course.id ?? randomLocalId(`existing-${index}`),
			id: course.id,
			name: course.name.trim(),
			code: course.code?.trim().toUpperCase() ?? "",
			term: course.term?.trim() ?? "",
		}));
}

function toCoursePayload(items: CourseItem[]): ProfileCourseInput[] {
	return items
		.map(({ id, name, code, term }) => ({
			id,
			name: name.trim(),
			code: code.trim().toUpperCase() || undefined,
			term: term.trim() || undefined,
		}))
		.filter((course) => course.name.length > 0);
}

function ensureCourses(record: ProfileRecord): ProfileRecord {
	return {
		...record,
		courses: Array.isArray(record.courses) ? record.courses : [],
	};
}

function mergeCourses(prev: ProfileRecord | null, next: ProfileRecord): ProfileRecord {
	const hasCoursesProperty = Object.prototype.hasOwnProperty.call(next, "courses");
	if (!hasCoursesProperty && prev?.courses) {
		return { ...ensureCourses(next), courses: prev.courses };
	}
	return ensureCourses(next);
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
	const toast = useContext(ToastContext);
	const [activeTab, setActiveTab] = useState<"general" | "gallery" | "courses" | "settings">("general");
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
	const [coursesDraft, setCoursesDraft] = useState<CourseItem[]>([]);
	const [courseSaving, setCourseSaving] = useState<boolean>(false);
	const [courseErrorMessage, setCourseErrorMessage] = useState<string | null>(null);
	const [courseFeedback, setCourseFeedback] = useState<string | null>(null);
	const [activeCourseForm, setActiveCourseForm] = useState<{ mode: "create" | "edit"; targetId?: string } | null>(null);
	const [courseFormState, setCourseFormState] = useState<CourseFormState>(emptyCourseForm());
	const courseCodeId = useId();
	const normaliseCourses = useCallback(
		(list: ProfileCourse[] | undefined | null) => {
			const uppercased = toCourseItems(list).map((course) => ({
				...course,
				code: course.code.toUpperCase(),
				name: course.name.trim(),
			}));
			const deduped: Record<string, CourseItem> = {};
			for (const course of uppercased) {
				const key = course.code || course.name.toUpperCase();
				if (!deduped[key]) {
					deduped[key] = course;
				}
			}
			return Object.values(deduped);
		},
		[],
	);

	const isDraftMode = profile === null && draftProfile !== null;
	const activeProfile = profile ?? draftProfile;
	const completion = useMemo(() => (activeProfile ? calculateCompletion(activeProfile) : 0), [activeProfile]);
	const activeSegments = useMemo(() => {
		const clamped = Math.min(Math.max(completion, 0), 100);
		return Math.round((clamped / 100) * PROGRESS_SEGMENTS);
	}, [completion]);
	const missingTasks = useMemo(() => (activeProfile ? buildMissingTasks(activeProfile) : []), [activeProfile]);

	useEffect(() => {
		setCoursesDraft(normaliseCourses(activeProfile?.courses));
		setActiveCourseForm(null);
		setCourseFormState(emptyCourseForm());
		setCourseErrorMessage(null);
		setCourseFeedback(null);
	}, [activeProfile?.courses, normaliseCourses]);

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
				const [record, courses] = await Promise.all([
					fetchProfile(safeUserId, safeCampusId),
					fetchUserCourses(safeUserId, safeCampusId).catch(() => null),
				]);
				const hydrated = ensureCourses({
					...record,
					...(Array.isArray(courses) ? { courses } : {}),
				});
				if (!cancelled) {
					setProfile(hydrated);
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
						ensureCourses(
							loadDraftFromStorage(safeUserId, safeCampusId) ??
							createOfflineProfile(safeUserId, safeCampusId),
						),
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



		const merged = mergeCourses(profile, updated);
		setProfile(merged);
		setDraftProfile(null);

		const snapshot = readAuthSnapshot();
		if (snapshot) {
			storeAuthSnapshot({
				...snapshot,
				handle: updated.handle,
				display_name: updated.display_name,
			});
		}

		return merged;
	}, [authUser, profile]);

	const handleAvatarUpload = useCallback(async (file: File) => {
		if (!authUser) {
			throw new Error("Sign in to update your profile photo.");
		}
		const payload: PresignPayload = { mime: file.type || "application/octet-stream", bytes: file.size };
		const presigned = await presignAvatar(authUser.userId, authUser.campusId ?? null, payload);
		await uploadToPresignedUrl(presigned.url, file);
		const updated = await commitAvatar(authUser.userId, authUser.campusId ?? null, presigned.key);
		const merged = mergeCourses(profile, updated);
		setProfile(merged);
		setDraftProfile(null);
		return merged;
	}, [authUser, profile]);

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
					? "Reconnect to Campus to sync your gallery."
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
				const merged = mergeCourses(profile, updated);
				setProfile(merged);
				setDraftProfile(null);
				return merged;
			} catch (err) {
				const message = err instanceof Error ? err.message : "Failed to upload photo";
				setGalleryError(message);
				throw err instanceof Error ? err : new Error(message);
			} finally {
				setGalleryUploading(false);
			}
		},
		[authUser, isDraftMode, profile],
	);

	const handleGalleryRemove = useCallback(
		async (key: string) => {
			if (!authUser || isDraftMode) {
				const message = isDraftMode
					? "Reconnect to Campus to sync your gallery."
					: "Sign in to manage your gallery.";
				setGalleryError(message);
				throw new Error(message);
			}
			setGalleryError(null);
			setGalleryRemovingKey(key);
			try {
				const updated = await removeGalleryImage(authUser.userId, authUser.campusId ?? null, key);
				const merged = mergeCourses(profile, updated);
				setProfile(merged);
				setDraftProfile(null);
				return merged;
			} catch (err) {
				const message = err instanceof Error ? err.message : "Failed to remove photo";
				setGalleryError(message);
				throw err instanceof Error ? err : new Error(message);
			} finally {
				setGalleryRemovingKey(null);
			}
		},
		[authUser, isDraftMode, profile],
	);

	const openCreateCourseForm = useCallback(() => {
		setActiveCourseForm({ mode: "create" });
		setCourseFormState(emptyCourseForm());
		setCourseErrorMessage(null);
		setCourseFeedback(null);
	}, []);

	const openEditCourseForm = useCallback((course: CourseItem) => {
		setActiveCourseForm({ mode: "edit", targetId: course._localId });
		setCourseFormState({ name: course.name, code: course.code, term: course.term });
		setCourseErrorMessage(null);
		setCourseFeedback(null);
	}, []);

	const cancelCourseForm = useCallback(() => {
		setActiveCourseForm(null);
		setCourseFormState(emptyCourseForm());
		setCourseErrorMessage(null);
	}, []);

	const handleCourseInputChange = useCallback((field: keyof CourseFormState, value: string) => {
		setCourseFormState((prev) => ({ ...prev, [field]: value }));
		setCourseErrorMessage(null);
	}, []);

	const persistCourses = useCallback(async (newCourses: CourseItem[]) => {
		const payload = toCoursePayload(newCourses);
		setCourseSaving(true);
		setCourseErrorMessage(null);
		try {
			if (isDraftMode) {
				const persisted: ProfileCourse[] = payload.map((course) => ({
					id: course.id,
					name: course.name,
					code: course.code ?? null,
					term: course.term ?? null,
				}));
				setDraftProfile((prev) => (prev ? { ...prev, courses: persisted } : prev));
				setCourseFeedback("Courses saved to your draft profile.");
				if (toast) {
					toast.push({
						title: "Courses saved",
						description: "Draft profile updated locally.",
						variant: "success",
					});
				}
				return;
			}
			if (!authUser) {
				throw new Error("Sign in to update courses.");
			}
			const updatedCourses = await saveProfileCourses(authUser.userId, authUser.campusId ?? null, payload);
			const safeCourses = updatedCourses.map((c) => ({ ...c, name: c.name || c.code }));
			setProfile((prev) => (prev ? { ...prev, courses: safeCourses } : prev));
			setDraftProfile((prev) => (prev ? { ...prev, courses: safeCourses } : prev));
			setCourseFeedback("Courses updated.");
			setCoursesDraft(normaliseCourses(safeCourses));
			if (toast) {
				toast.push({
					title: "Courses updated",
					description: "We’ll recommend classmates and groups based on these.",
					variant: "success",
				});
			}
		} catch (err) {
			const message = err instanceof Error ? err.message : "Unable to save courses.";
			setCourseErrorMessage(message);
			if (toast) {
				toast.push({
					title: "Course save failed",
					description: message,
					variant: "error",
				});
			}
		} finally {
			setCourseSaving(false);
		}
	}, [authUser, isDraftMode, normaliseCourses, toast]);


	const handleCourseFormSubmit = useCallback(() => {
		const codeTrimmed = courseFormState.code.trim();
		// Allow saving if code is present.

		if (!codeTrimmed) {
			setCourseErrorMessage("Course code is required.");
			return;
		}

		const finalCode = codeTrimmed.toUpperCase();

		let nextCourses: CourseItem[];
		if (activeCourseForm?.mode === "edit" && activeCourseForm.targetId) {
			nextCourses = coursesDraft.map((course) =>
				course._localId === activeCourseForm.targetId
					? { ...course, name: finalCode, code: finalCode, term: "" }
					: course,
			);
		} else {
			const newCourse: CourseItem = {
				_localId: randomLocalId("new"),
				name: finalCode,
				code: finalCode,
				term: "",
			};
			nextCourses = [...coursesDraft, newCourse];
		}
		setCoursesDraft(nextCourses);
		setActiveCourseForm(null);
		setCourseFormState(emptyCourseForm());
		setCourseErrorMessage(null);
		setCourseFeedback(null);
		void persistCourses(nextCourses);
	}, [activeCourseForm, courseFormState, coursesDraft, persistCourses]);

	const handleCourseRemove = useCallback(
		(targetId: string) => {
			const nextCourses = coursesDraft.filter((course) => course._localId !== targetId);
			setCoursesDraft(nextCourses);
			setCourseFeedback(null);
			setCourseErrorMessage(null);
			if (activeCourseForm?.targetId === targetId) {
				setActiveCourseForm(null);
				setCourseFormState(emptyCourseForm());
			}
			void persistCourses(nextCourses);
		},
		[activeCourseForm, coursesDraft, persistCourses],
	);





	const retryFetch = useCallback(() => {
		setReloadToken((prev) => prev + 1);
	}, []);

	const router = useRouter();

	const handleRequestDeletion = useCallback(async () => {
		if (!profile || isDraftMode || deleteLoading || !authUser) {
			if (isDraftMode) {
				setDeleteNotice("Account deletion is available after you create and verify your Campus account.");
			}
			if (!authUser) {
				setDeleteNotice("Sign in to request account deletion.");
			}
			return;
		}
		const confirmed = window.confirm(
			"Are you sure you want to delete your account? You will lose all your data including friends, messages, game history, and social score. This action cannot be undone. Continue?",
		);
		if (!confirmed) {
			return;
		}
		setDeleteLoading(true);
		setDeleteNotice(null);
		try {
			await forceDeleteAccount(authUser.userId, authUser.campusId ?? null);
			// Clear all auth data
			if (typeof window !== "undefined") {
				window.localStorage.removeItem("divan.auth.snapshot");
				window.localStorage.removeItem("divan.auth.token");
				window.localStorage.removeItem("divan.auth.refreshToken");
				window.localStorage.clear();
			}
			// Redirect to login
			router.push("/login");
		} catch (err) {
			const message = err instanceof Error ? err.message : "Unable to delete account";
			setError(message);
		} finally {
			setDeleteLoading(false);
		}
	}, [profile, isDraftMode, deleteLoading, authUser, router]);

	const formSubmit = isDraftMode ? handleDraftSubmit : handleSubmit;
	const avatarUpload = isDraftMode ? handleDraftAvatarUpload : handleAvatarUpload;
	const deletionHandler = !isDraftMode ? handleRequestDeletion : undefined;
	const galleryImages = activeProfile?.gallery ?? [];
	const galleryDisabled = isDraftMode || !authUser;

	const TABS = [
		{ id: "general", label: "General", icon: User },
		{ id: "gallery", label: "Gallery", icon: ImageIcon },
		{ id: "courses", label: "Courses", icon: BookOpen },
		{ id: "settings", label: "Settings", icon: Settings },
	] as const;

	const renderContent = () => {
		if (!activeProfile) return null;

		switch (activeTab) {
			case "general":
				return (
					<motion.div
						initial={{ opacity: 0, y: 10 }}
						animate={{ opacity: 1, y: 0 }}
						exit={{ opacity: 0, y: -10 }}
						transition={{ duration: 0.2 }}
						className="rounded-3xl border border-slate-200 bg-white/80 p-6 shadow-sm backdrop-blur"
					>
						<ProfileForm
							profile={activeProfile}
							onSubmit={formSubmit}
							onAvatarUpload={avatarUpload}
							onRequestDeletion={deletionHandler}
							deleteLoading={deleteLoading}
						/>
					</motion.div>
				);
			case "gallery":
				return (
					<motion.div
						initial={{ opacity: 0, y: 10 }}
						animate={{ opacity: 1, y: 0 }}
						exit={{ opacity: 0, y: -10 }}
						transition={{ duration: 0.2 }}
						className="rounded-3xl border border-slate-200 bg-white/80 p-6 shadow-sm backdrop-blur"
					>
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
					</motion.div>
				);
			case "courses":
				return (
					<motion.div
						initial={{ opacity: 0, y: 10 }}
						animate={{ opacity: 1, y: 0 }}
						exit={{ opacity: 0, y: -10 }}
						transition={{ duration: 0.2 }}
						className="rounded-3xl border border-slate-200 bg-white/80 p-6 shadow-sm backdrop-blur"
					>
						<header className="flex flex-wrap items-center justify-between gap-3">
							<div>
								<h2 className="text-sm font-semibold text-slate-900">Courses</h2>
								<p className="mt-1 text-xs text-slate-500">
									List the classes you are taking so we can suggest study groups and match classmates.
								</p>
							</div>
							<button
								type="button"
								onClick={openCreateCourseForm}
								disabled={courseSaving || !!activeCourseForm}
								className="rounded-full border border-slate-300 px-4 py-2 text-xs font-semibold text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
							>
								Add course
							</button>
						</header>
						{courseErrorMessage ? (
							<p className="mt-4 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-2 text-sm text-rose-700">
								{courseErrorMessage}
							</p>
						) : null}
						{activeCourseForm?.mode === "create" ? (
							<div className="mt-4 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4">
								<p className="text-sm font-semibold text-slate-900">Add course</p>
								<div className="mt-3">
									<label className="flex flex-col gap-1 text-sm text-slate-700" htmlFor={courseCodeId}>
										<span className="font-medium">Course code<span className="text-rose-500">*</span></span>
										<input
											id={courseCodeId}
											type="text"
											value={courseFormState.code}
											onChange={(event) => handleCourseInputChange("code", event.target.value)}
											className="rounded border border-slate-300 px-3 py-2 text-sm uppercase focus:border-slate-500 focus:outline-none"
											maxLength={24}
											placeholder="e.g., MATH 201"
											autoFocus
											required
											onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); handleCourseFormSubmit(); } }}
										/>
									</label>
								</div>
								<div className="mt-4 flex flex-wrap justify-end gap-2">
									<button
										type="button"
										onClick={cancelCourseForm}
										className="rounded-full border border-slate-300 px-4 py-2 text-xs font-semibold text-slate-700 transition hover:bg-slate-50"
									>
										Cancel
									</button>
									<button
										type="button"
										onClick={handleCourseFormSubmit}
										disabled={courseSaving}
										className="rounded-full bg-slate-900 px-4 py-2 text-xs font-semibold text-white shadow transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-400"
									>
										Add
									</button>
								</div>
							</div>
						) : null}
						{coursesDraft.length ? (
							<ul className="mt-4 space-y-3">
								{coursesDraft.map((course) => {
									const isEditing = activeCourseForm?.mode === "edit" && activeCourseForm.targetId === course._localId;
									return (
										<li key={course._localId} className="rounded-2xl border border-slate-200 bg-white px-4 py-3 shadow-sm">
											{isEditing ? (
												<div>
													<p className="text-sm font-semibold text-slate-900">Edit course</p>
													<div className="mt-3">
														<label className="flex flex-col gap-1 text-sm text-slate-700" htmlFor={`${courseCodeId}-edit`}>
															<span className="font-medium">Course code<span className="text-rose-500">*</span></span>
															<input
																id={`${courseCodeId}-edit`}
																type="text"
																value={courseFormState.code}
																onChange={(event) => handleCourseInputChange("code", event.target.value)}
																className="rounded border border-slate-300 px-3 py-2 text-sm uppercase focus:border-slate-500 focus:outline-none"
																maxLength={24}
																placeholder="e.g., MATH 201"
																autoFocus
																required
																onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); handleCourseFormSubmit(); } }}
															/>
														</label>
													</div>
													<div className="mt-4 flex flex-wrap justify-end gap-2">
														<button
															type="button"
															onClick={cancelCourseForm}
															className="rounded-full border border-slate-300 px-4 py-2 text-xs font-semibold text-slate-700 transition hover:bg-slate-50"
														>
															Cancel
														</button>
														<button
															type="button"
															onClick={handleCourseFormSubmit}
															disabled={courseSaving}
															className="rounded-full bg-slate-900 px-4 py-2 text-xs font-semibold text-white shadow transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-400"
														>
															Save
														</button>
													</div>
												</div>
											) : (
												<div className="flex items-center justify-between">
													<span className="rounded-full bg-emerald-50 px-4 py-2 text-sm font-semibold text-emerald-700 ring-1 ring-emerald-200">
														{course.code || course.name}
													</span>
													<div className="flex gap-2">
														<button
															type="button"
															onClick={() => openEditCourseForm(course)}
															className="rounded-full border border-slate-300 px-3 py-1.5 text-xs font-semibold text-slate-700 transition hover:bg-slate-50"
														>
															Edit
														</button>
														<button
															type="button"
															onClick={() => handleCourseRemove(course._localId)}
															className="rounded-full border border-rose-200 px-3 py-1.5 text-xs font-semibold text-rose-600 transition hover:bg-rose-50"
														>
															Remove
														</button>
													</div>
												</div>
											)}
										</li>
									);
								})}
							</ul>
						) : (
							<p className="mt-4 text-sm text-slate-500">
								No courses added yet. Add the classes you are taking to unlock smarter invites and study group suggestions.
							</p>
						)}

						{courseFeedback && !courseErrorMessage ? (
							<p className="mt-3 text-xs font-medium text-emerald-600">{courseFeedback}</p>
						) : null}
					</motion.div>
				);
			case "settings":
				return (
					<motion.div
						initial={{ opacity: 0, y: 10 }}
						animate={{ opacity: 1, y: 0 }}
						exit={{ opacity: 0, y: -10 }}
						transition={{ duration: 0.2 }}
					>
						<WebsiteSettings />
					</motion.div>
				);
			default:
				return null;
		}
	};

	return (
		<main className="relative min-h-screen bg-gradient-to-br from-slate-100 via-white to-slate-200 dark:from-slate-900 dark:via-slate-950 dark:to-slate-900">
			<div className="pointer-events-none absolute inset-0 -z-10 bg-[radial-gradient(circle_at_top_right,_rgba(148,163,184,0.18),_transparent_60%)]" />
			<div className="mx-auto flex w-full max-w-5xl px-6 py-12 flex-col gap-6">
				<header className="flex flex-col gap-2">
					<p className="text-xs font-semibold uppercase tracking-[0.3em] text-slate-500 dark:text-slate-400">Profile settings</p>
					<h1 className="text-3xl font-semibold text-slate-900 dark:text-white sm:text-4xl">Shape your uniHood identity</h1>
					<p className="text-sm text-slate-600 dark:text-slate-400 sm:text-base">
						Manage how classmates discover you across uniHood. Updates apply instantly to invites, rooms, and the Social Hub.
					</p>
				</header>
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
						<div className="flex flex-col gap-6">
							<div className="flex gap-2 overflow-x-auto pb-2">
								{TABS.map((tab) => {
									const isActive = activeTab === tab.id;
									const Icon = tab.icon;
									return (
										<button
											key={tab.id}
											onClick={() => setActiveTab(tab.id)}
											className={`flex items-center gap-2 rounded-full px-4 py-2 text-sm font-semibold transition-all ${isActive
												? "bg-slate-900 text-white shadow-md"
												: "bg-white text-slate-600 hover:bg-slate-50"
												}`}
										>
											<Icon className="h-4 w-4" />
											{tab.label}
										</button>
									);
								})}
							</div>
							<AnimatePresence mode="wait">
								{renderContent()}
							</AnimatePresence>
						</div>
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
										</div>
										<p className="text-sm text-white/70">
											{activeProfile.bio ? activeProfile.bio : "Introduce yourself to unlock uniHood highlights."}
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
											className={`flex-1 transition-colors duration-300 ${index < activeSegments ? "bg-emerald-500" : "bg-transparent"
												}`}
										/>
									))}
								</div>
								<p className="mt-3 text-xs text-slate-500">
									Add your uniHood story to unlock more Social Hub entry points and richer recommendations.
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
										Great work, your profile is ready for the next wave of features.
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
