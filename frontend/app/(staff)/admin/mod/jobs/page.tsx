'use client';

import { useEffect, useMemo, useState } from "react";

import { JobDetailPanel } from "@/components/mod/jobs/detail-panel";
import { JobsList } from "@/components/mod/jobs/list";
import { useJob, useJobs } from "@/hooks/mod/use-jobs";

export default function ModerationJobsPage() {
	const [selectedJobId, setSelectedJobId] = useState<string | null>(null);
	const { data: jobsData, error, isLoading, refetch, isFetching } = useJobs();
	const jobs = useMemo(() => jobsData?.items ?? [], [jobsData]);

	useEffect(() => {
		if (!selectedJobId && jobs.length) {
			setSelectedJobId(jobs[0].id);
		}
	}, [jobs, selectedJobId]);

	const { data: jobDetail, isLoading: jobLoading } = useJob(selectedJobId);

	const errorMessage = error ? (error instanceof Error ? error.message : "Unable to load jobs") : null;
	const refreshing = isFetching && !isLoading;

	return (
		<div className="flex flex-col gap-6">
			<header className="flex flex-wrap items-center justify-between gap-3">
				<div>
					<h2 className="text-2xl font-semibold text-slate-900">Jobs</h2>
					<p className="text-sm text-slate-600">Track macro runs and batch operations as they progress.</p>
				</div>
				<button
					type="button"
					onClick={() => refetch()}
					className="rounded-full border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-600 shadow-sm transition hover:border-slate-400 hover:text-slate-900"
					disabled={refreshing}
				>
					{refreshing ? "Refreshing…" : "Refresh"}
				</button>
			</header>

			{errorMessage && (
				<div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{errorMessage}</div>
			)}

			<div className="grid gap-4 lg:grid-cols-2">
				<JobsList jobs={jobs} activeJobId={selectedJobId} onSelect={setSelectedJobId} loading={isLoading} />
				<JobDetailPanel job={jobDetail} loading={jobLoading} />
			</div>
		</div>
	);
}
