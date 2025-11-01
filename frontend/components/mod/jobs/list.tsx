"use client";

import type { ModerationJob } from "@/hooks/mod/use-jobs";

export type JobsListProps = {
	jobs: ModerationJob[];
	activeJobId: string | null;
	onSelect: (jobId: string) => void;
	loading?: boolean;
};

const STATUS_STYLES: Record<ModerationJob['status'], string> = {
	queued: "bg-slate-200 text-slate-600",
	running: "bg-amber-100 text-amber-700",
	completed: "bg-emerald-100 text-emerald-700",
	failed: "bg-rose-100 text-rose-700",
	cancelled: "bg-slate-300 text-slate-700",
};

export function JobsList({ jobs, activeJobId, onSelect, loading }: JobsListProps) {
	if (loading && jobs.length === 0) {
		return (
			<div className="rounded-2xl border border-slate-200 bg-white p-6 text-sm text-slate-500">Loading jobs…</div>
		);
	}

	if (!jobs.length) {
		return (
			<div className="rounded-2xl border border-slate-200 bg-white p-6 text-sm text-slate-500">No jobs found yet.</div>
		);
	}

	return (
		<ul className="divide-y divide-slate-200 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
			{jobs.map((job) => {
				const isActive = job.id === activeJobId;
				return (
					<li key={job.id}>
						<button
							type="button"
							onClick={() => onSelect(job.id)}
							className={`flex w-full items-center justify-between gap-4 px-4 py-3 text-left text-sm transition hover:bg-slate-50 ${isActive ? 'bg-slate-100' : ''}`}
							aria-pressed={isActive ? 'true' : 'false'}
						>
							<div className="flex flex-col">
								<span className="font-mono text-sm text-slate-700">{job.id}</span>
								<span className="text-xs text-slate-500">{job.job_type}</span>
							</div>
							<div className="flex items-center gap-3">
								<span className={`rounded-full px-3 py-1 text-xs font-semibold ${STATUS_STYLES[job.status]}`}>{job.status}</span>
								<span className="text-xs text-slate-500">
									{job.succeeded}/{job.total} done
								</span>
							</div>
						</button>
					</li>
				);
			})}
		</ul>
	);
}
