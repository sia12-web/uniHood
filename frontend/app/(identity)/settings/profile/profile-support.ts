import type { AuthUser } from "@/lib/auth-storage";
import { getDemoCampusId, getDemoUserId } from "@/lib/env";
import type { ProfileRecord } from "@/lib/types";

const DEMO_USER_ID = getDemoUserId();
const DEMO_CAMPUS_ID = getDemoCampusId();

export const DRAFT_STORAGE_KEY = "divan.profile.draft";

export type ProfileFetchContext = {
	userId: string;
	campusId: string | null;
	mode: "live" | "demo";
};

export function resolveProfileContext(authUser: AuthUser | null): ProfileFetchContext {
	if (authUser?.userId) {
		return {
			userId: authUser.userId,
			campusId: authUser.campusId ?? null,
			mode: "live",
		};
	}
	return {
		userId: DEMO_USER_ID,
		campusId: DEMO_CAMPUS_ID,
		mode: "demo",
	};
}

export type StoredProfileDraft = {
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
	avatar_url?: string | null;
	avatar_key?: string | null;
	gallery: ProfileRecord["gallery"];
};

export function createOfflineProfile(userId: string, campusId: string | null): ProfileRecord {
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

export function normaliseDraft(
	candidate: Partial<StoredProfileDraft> | null,
	userId: string,
	campusId: string | null,
): ProfileRecord {
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
			? candidate.passions
					.filter((item) => typeof item === "string")
					.map((item) => item.trim())
					.filter(Boolean)
			: base.passions,
		gallery: Array.isArray(candidate.gallery)
			? candidate.gallery.filter(
				(item): item is ProfileRecord["gallery"][number] =>
					Boolean(item && typeof item === "object" && typeof item.key === "string" && typeof item.url === "string"),
			  )
			: base.gallery,
	};
}

export function loadDraftFromStorage(userId: string, campusId: string | null): ProfileRecord | null {
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

export function storeDraftProfile(profile: ProfileRecord): void {
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
		avatar_url: profile.avatar_url ?? null,
		avatar_key: profile.avatar_key ?? null,
		gallery: profile.gallery ?? [],
	};
	try {
		window.localStorage.setItem(DRAFT_STORAGE_KEY, JSON.stringify(payload));
	} catch {
		// Ignore persistence failures (quota, private mode, etc.).
	}
}

export function clearDraftProfile(): void {
	if (typeof window === "undefined") {
		return;
	}
	try {
		window.localStorage.removeItem(DRAFT_STORAGE_KEY);
	} catch {
		// noop
	}
}
