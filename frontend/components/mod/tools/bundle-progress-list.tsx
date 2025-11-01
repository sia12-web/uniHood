"use client";

import type { ToolJobRecord } from "@/hooks/mod/tools/use-jobs";

const statusStyles: Record<ToolJobRecord["status"], string> = {
	queued: "bg-sky-100 text-sky-700",
	running: "bg-amber-100 text-amber-700",
	completed: "bg-emerald-100 text-emerald-700",
	failed: "bg-rose-100 text-rose-700",
	cancelled: "bg-slate-200 text-slate-600",
};

export type BundleProgressListProps = {
	jobs: ToolJobRecord[];
	loading?: boolean;
	selectedJobId: string | null;
	onSelect(jobId: string): void;
};

export function BundleProgressList({ jobs, loading = false, selectedJobId, onSelect }: BundleProgressListProps) {
	return (
		<section className="space-y-3">
			<header className="flex items-center justify-between">
				<h2 className="text-lg font-semibold text-slate-900">Recent bundle jobs</h2>
				{loading ? <span className="text-sm text-slate-500">Refreshing…</span> : null}
			</header>
			<ul className="divide-y divide-slate-200 overflow-hidden rounded-2xl border border-slate-200 bg-white">
				{jobs.length === 0 ? (
					<li className="px-4 py-6 text-sm text-slate-500">No jobs yet. Run a bundle import to see progress.</li>
				) : (
					jobs.map((job) => {
						const isSelected = job.id === selectedJobId;
						const progressText = job.total ? `${job.succeeded ?? 0}/${job.total}` : job.succeeded ?? "—";
						return (
							<li key={job.id}>
								<button
									type="button"
									onClick={() => onSelect(job.id)}
									className={`w-full px-4 py-4 text-left transition ${
										isSelected ? "bg-slate-900/5" : "hover:bg-slate-50"
									}`}
								>
									<div className="flex flex-wrap items-center justify-between gap-2">
										<div>
											<p className="text-sm font-semibold text-slate-900">{job.type}</p>
											<p className="text-xs text-slate-500">Job {job.id}</p>
										</div>
										<div className="flex items-center gap-3">
											<span className={`rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-wide ${statusStyles[job.status]}`}>
												{job.status}
											</span>
											{job.dry_run ? <span className="rounded-full bg-slate-100 px-2 py-1 text-xs font-medium text-slate-600">Dry-run</span> : null}
											<span className="text-xs text-slate-500">{progressText}</span>
										</div>
									</div>
								</button>
							</li>
						);
					})
					)
				}
			</ul>
		</section>
	);
}
