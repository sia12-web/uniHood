import type { StaffProfile, StaffGuardResult } from "@/lib/staff-auth-guard";
import { requireStaff } from "@/lib/staff-auth-guard";

export function hasAdminScope(profile: StaffProfile | null | undefined): boolean {
	if (!profile) return false;
	const scopes = new Set(profile.scopes ?? []);
	return scopes.has("staff.admin");
}

export async function requireAdmin(): Promise<StaffGuardResult> {
	return requireStaff("admin");
}

export function assertAdmin(profile: StaffProfile): void {
	if (!hasAdminScope(profile)) {
		throw new Error("Admin scope required");
	}
}
