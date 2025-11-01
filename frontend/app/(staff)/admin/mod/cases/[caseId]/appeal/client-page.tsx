"use client";

import { useMemo, useState } from "react";

import { AppealResolutionPanel } from "@/components/mod/case-appeal/panel";
import { ResolveAppealDialog } from "@/components/mod/case-appeal/resolve-dialog";
import { useCase } from "@/hooks/mod/use-case";
import { useResolveAppeal } from "@/hooks/mod/appeal/use-resolve-appeal";

export function AppealPageClient({ caseId }: { caseId: string }) {
	const [dialogOpen, setDialogOpen] = useState(false);
	const caseQuery = useCase(caseId);
	const resolver = useResolveAppeal(caseId);

	const caseItem = caseQuery.data;
	const loading = caseQuery.isLoading;
	const error = caseQuery.error instanceof Error ? caseQuery.error.message : null;
	const suggestions = caseItem?.suggested_actions ?? [];
	const appealId = caseItem?.appeal?.id ?? caseId;

	const subject = useMemo(() => {
		if (!caseItem) return null;
		return {
			subjectType: caseItem.subject_type,
			subjectId: caseItem.subject_id,
			status: caseItem.status,
		};
	}, [caseItem]);

	return (
		<div className="space-y-6">
			<section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
				<header className="flex flex-wrap items-center justify-between gap-3">
					<div>
						<h1 className="text-xl font-semibold text-slate-900">Appeal resolution</h1>
						<p className="text-sm text-slate-500">Case {caseId}</p>
					</div>
					<button
						type="button"
						onClick={() => caseQuery.refetch()}
						className="rounded-full border border-slate-200 px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-100"
						disabled={caseQuery.isFetching}
					>
						{caseQuery.isFetching ? "Refreshing…" : "Refresh"}
					</button>
				</header>
				{subject ? (
					<dl className="mt-4 grid gap-4 text-sm text-slate-600 sm:grid-cols-3">
						<div>
							<dt className="text-xs font-semibold uppercase tracking-wide text-slate-500">Subject</dt>
							<dd>{subject.subjectType ?? "Unknown"}</dd>
						</div>
						<div>
							<dt className="text-xs font-semibold uppercase tracking-wide text-slate-500">Target</dt>
							<dd>{subject.subjectId ?? "—"}</dd>
						</div>
						<div>
							<dt className="text-xs font-semibold uppercase tracking-wide text-slate-500">Status</dt>
							<dd>{subject.status}</dd>
						</div>
					</dl>
				) : null}
				{loading ? <div className="mt-6 h-24 animate-pulse rounded-2xl bg-slate-100" /> : null}
				{error ? (
					<p className="mt-4 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-2 text-sm text-rose-700">{error}</p>
				) : null}
			</section>
			<AppealResolutionPanel
				appeal={caseItem?.appeal ?? null}
				canResolve={Boolean(caseItem?.appeal && caseItem.appeal.status === "pending")}
				onResolveClick={() => setDialogOpen(true)}
				suggestedActions={suggestions}
			/>
			<ResolveAppealDialog
				open={dialogOpen}
				onDismiss={() => setDialogOpen(false)}
				revertors={suggestions}
				loading={resolver.isPending}
				onSubmit={async ({ status, note }) => {
					await resolver.mutateAsync({ appeal_id: appealId, status, note });
				}}
			/>
		</div>
	);
}
