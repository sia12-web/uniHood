"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import { ToolJobDetailCard } from "@/components/mod/tools/tool-job-detail";
import { ToolJobList } from "@/components/mod/tools/tool-job-list";
import { useJobDetail, useJobsList, useJobsSocket } from "@/hooks/mod/tools/use-jobs";

export function JobsClient() {
	const [search, setSearch] = useState("");
	const [selectedJobId, setSelectedJobId] = useState<string | null>(null);
	const jobs = useJobsList({ limit: 50 });

	const filteredJobs = useMemo(() => {
		const term = search.trim().toLowerCase();
		const items = jobs.data?.items ?? [];
		if (!term) return items;
		return items.filter((job) => job.id.toLowerCase().includes(term) || job.type.toLowerCase().includes(term));
	}, [jobs.data?.items, search]);

	useEffect(() => {
		if (!selectedJobId && filteredJobs.length) {
			setSelectedJobId(filteredJobs[0].id);
		}
	}, [filteredJobs, selectedJobId]);

	const jobDetail = useJobDetail(selectedJobId);
	useJobsSocket(selectedJobId);

	const handleRefresh = useCallback(() => {
		void jobs.refetch();
	}, [jobs]);

	return (
		<div className="space-y-6">
			<header className="flex flex-wrap items-center justify-between gap-3">
				<div>
					<h1 className="text-2xl font-semibold text-slate-900">Jobs</h1>
					<p className="text-sm text-slate-600">Track batch tool executions and inspect NDJSON output.</p>
				</div>
				<button
					type="button"
					onClick={handleRefresh}
					className="rounded-full border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-600 hover:border-slate-300"
				>
					Refresh
				</button>
			</header>

			<div className="grid gap-4 sm:grid-cols-[2fr_3fr]">
				<div className="space-y-3">
					<label className="space-y-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
						<span>Filter</span>
						<input
							type="text"
							value={search}
							onChange={(event) => setSearch(event.target.value)}
							className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-700"
							placeholder="Search by job ID or type"
						/>
					</label>
					<ToolJobList jobs={filteredJobs} loading={jobs.isFetching} selectedJobId={selectedJobId} onSelect={(id) => setSelectedJobId(id)} />
				</div>
				<ToolJobDetailCard job={jobDetail.data ?? null} />
			</div>
		</div>
	);
}
