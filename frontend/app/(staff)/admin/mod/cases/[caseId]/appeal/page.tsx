import { Suspense } from "react";

import { AppealPageClient } from "./client-page";
import { requireStaff } from "@/lib/staff-auth-guard";

export default async function CaseAppealPage({ params }: { params: { caseId: string } }) {
	await requireStaff("admin");
	const caseId = decodeURIComponent(params.caseId);

	return (
		<Suspense fallback={<div className="rounded-3xl border border-slate-200 bg-white p-5 text-sm text-slate-600">Loading appeal…</div>}>
			<AppealPageClient caseId={caseId} />
		</Suspense>
	);
}
