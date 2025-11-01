import { Suspense } from "react";

import { LinkageClient } from "./client-page";
import { requireStaff } from "@/lib/staff-auth-guard";

export default async function UserLinkagePage({ params }: { params: { userId: string } }) {
	const { profile, availableCampuses } = await requireStaff("moderator");
	const scopes = profile.scopes ?? [];
	const isAdmin = scopes.includes("staff.admin");
	const userId = decodeURIComponent(params.userId);

	return (
		<Suspense fallback={<div className="rounded-3xl border border-slate-200 bg-white p-5 text-sm text-slate-600">Loading linkage…</div>}>
			<LinkageClient userId={userId} isAdmin={isAdmin} campuses={availableCampuses} />
		</Suspense>
	);
}
