import { apiFetch, type ApiFetchOptions } from "@/app/lib/http/client";
import { getBackendUrl } from "./env";
import type { CampusRow, ProfileCourse, ProfilePrivacy, ProfileRecord, ProfileStatus } from "./types";

const BASE_URL = getBackendUrl();

async function request<T>(path: string, options: ApiFetchOptions = {}): Promise<T> {
	return apiFetch<T>(`${BASE_URL}${path}`, {
		cache: "no-store",
		method: options.method ?? "GET",
		...options,
	});
}

export type RegisterPayload = {
	email: string;
	password: string;
	handle?: string;
	display_name?: string;
	campus_id?: string;
};

export type RegisterResponse = {
	user_id: string;
	email: string;
};

export type LoginPayload = {
	email: string;
	password: string;
};

export type LoginResponse = {
	access_token: string;
	refresh_token: string;
	token_type: "bearer";
	expires_in: number;
	user_id: string;
};

export type VerificationResponse = {
	verified: boolean;
	user_id: string;
};

export type ProfilePatchPayload = {
	display_name?: string;
	bio?: string;
	privacy?: Partial<ProfilePrivacy>;
	status?: Partial<Omit<ProfileStatus, "updated_at">> & { updated_at?: string };
	handle?: string;
	major?: string | null;
	graduation_year?: number | null;
	passions?: string[];
	courses?: string[];
};

export type ProfileCourseInput = Pick<ProfileCourse, "id" | "name" | "code" | "term">;

export type PresignPayload = {
	mime: string;
	bytes: number;
};

export type PresignResponse = {
	key: string;
	url: string;
	expires_s: number;
};

export async function listCampuses(): Promise<CampusRow[]> {
	return request<CampusRow[]>("/auth/campuses");
}

export async function registerIdentity(payload: RegisterPayload): Promise<RegisterResponse> {
	return request<RegisterResponse>("/auth/register", { method: "POST", body: payload });
}

export async function loginIdentity(payload: LoginPayload): Promise<LoginResponse> {
	return request<LoginResponse>("/auth/login", { method: "POST", body: payload });
}

export async function verifyEmailToken(token: string): Promise<VerificationResponse> {
	return request<VerificationResponse>("/auth/verify-email", {
		method: "POST",
		body: { token },
	});
}

export async function resendVerification(email: string): Promise<void> {
	await request<void>("/auth/resend", {
		method: "POST",
		body: { email },
	});
}

export async function forgotPassword(email: string): Promise<void> {
	await request<void>("/auth/forgot-password", {
		method: "POST",
		body: { email },
	});
}

export async function forgotUsername(email: string): Promise<void> {
	await request<void>("/auth/forgot-username", {
		method: "POST",
		body: { email },
	});
}

export async function resetPassword(token: string, newPassword: string): Promise<void> {
	await request<void>("/auth/reset-password", {
		method: "POST",
		body: { token, new_password: newPassword },
	});
}

function authHeaders(userId: string, campusId: string | null): Record<string, string> {
	return {
		"X-User-Id": userId,
		...(campusId ? { "X-Campus-Id": campusId } : {}),
	};
}

export async function fetchProfile(userId: string, campusId: string | null): Promise<ProfileRecord> {
	return request<ProfileRecord>("/profile/me", { headers: authHeaders(userId, campusId) });
}

export async function patchProfile(
	userId: string,
	campusId: string | null,
	patch: ProfilePatchPayload,
): Promise<ProfileRecord> {
	return request<ProfileRecord>("/profile/me", {
		method: "PATCH",
		body: patch,
		headers: authHeaders(userId, campusId),
	});
}

export async function presignAvatar(
	userId: string,
	campusId: string | null,
	payload: PresignPayload,
): Promise<PresignResponse> {
	return request<PresignResponse>("/profile/avatar/presign", {
		method: "POST",
		body: payload,
		headers: authHeaders(userId, campusId),
	});
}

export async function commitAvatar(
	userId: string,
	campusId: string | null,
	key: string,
): Promise<ProfileRecord> {
	return request<ProfileRecord>("/profile/avatar/commit", {
		method: "POST",
		body: { key },
		headers: authHeaders(userId, campusId),
	});
}

export async function presignGallery(
	userId: string,
	campusId: string | null,
	payload: PresignPayload,
): Promise<PresignResponse> {
	return request<PresignResponse>("/profile/gallery/presign", {
		method: "POST",
		body: payload,
		headers: authHeaders(userId, campusId),
	});
}

export async function commitGallery(
	userId: string,
	campusId: string | null,
	key: string,
): Promise<ProfileRecord> {
	return request<ProfileRecord>("/profile/gallery/commit", {
		method: "POST",
		body: { key },
		headers: authHeaders(userId, campusId),
	});
}

export async function removeGalleryImage(
	userId: string,
	campusId: string | null,
	key: string,
): Promise<ProfileRecord> {
	return request<ProfileRecord>("/profile/gallery/remove", {
		method: "POST",
		body: { key },
		headers: authHeaders(userId, campusId),
	});
}

export async function saveProfileCourses(
	userId: string,
	campusId: string | null,
	courses: ProfileCourseInput[],
): Promise<ProfileCourse[]> {
	return request<ProfileCourse[]>("/profile/courses", {
		method: "PUT",
		body: { courses },
		headers: authHeaders(userId, campusId),
	});
}

export type Course = {
	code: string;
	name?: string;
};

export async function fetchPopularCourses(campusId: string): Promise<Course[]> {
	return request<Course[]>(`/universities/${campusId}/popular-courses`);
}
