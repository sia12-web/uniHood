export const UNSELECTED_CAMPUS_IDS = new Set([
	// Placeholder/demo campus IDs used when a user hasn't picked a real university yet.
	"33333333-3333-3333-3333-333333333333",
	"aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
]);

export function isUnselectedCampusId(campusId: string | null | undefined): boolean {
	if (!campusId) return true;
	return UNSELECTED_CAMPUS_IDS.has(String(campusId));
}
