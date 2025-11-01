"use client";

import type { ModerationJob } from "@/hooks/mod/use-jobs";

export type JobDetailPanelProps = {
	job?: ModerationJob | null;
	loading?: boolean;
};

function formatDate(value?: string | null) {
	if (!value) {
		return "—";
	}
	return new Date(value).toLocaleString();
}

export function JobDetailPanel({ job, loading }: JobDetailPanelProps) {
	if (loading && !job) {
		return <div className="rounded-2xl border border-slate-200 bg-white p-6 text-sm text-slate-500">Loading job details…</div>;
	}

	if (!job) {
		return <div className="rounded-2xl border border-slate-200 bg-white p-6 text-sm text-slate-500">Select a job to inspect details.</div>;
	}

	return (
		<section className="space-y-4 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
			<header className="flex flex-col gap-2">
				<h3 className="font-mono text-sm font-semibold text-slate-900">Job {job.id}</h3>
				<p className="text-xs text-slate-500">{job.job_type}</p>
			</header>
			<div className="grid gap-3 text-sm text-slate-600 md:grid-cols-2">
				<p><span className="font-semibold">Status:</span> {job.status}</p>
				<p>
					<span className="font-semibold">Progress:</span> {job.succeeded}/{job.total} succeeded, {job.failed} failed
				</p>
				<p><span className="font-semibold">Initiated by:</span> {job.initiated_by}</p>
				<p><span className="font-semibold">Dry run:</span> {job.dry_run ? 'Yes' : 'No'}</p>
				<p><span className="font-semibold">Created:</span> {formatDate(job.created_at)}</p>
				<p><span className="font-semibold">Started:</span> {formatDate(job.started_at)}</p>
				<p><span className="font-semibold">Finished:</span> {formatDate(job.finished_at)}</p>
			</div>
			{job.params && Object.keys(job.params).length > 0 && (
				<section className="rounded-xl border border-slate-200 bg-slate-50 p-4 text-xs text-slate-600">
					<p className="font-semibold uppercase tracking-wide text-slate-500">Parameters</p>
					<pre className="mt-2 whitespace-pre-wrap break-all">{JSON.stringify(job.params, null, 2)}</pre>
				</section>
			)}
			{job.items?.length ? (
				<section>
					<p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Items</p>
					<ul className="mt-2 space-y-2 text-xs text-slate-600">
						{job.items.map((item, index) => (
							<li key={`${item.target_type}-${item.target_id}-${index}`} className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
								<div className="flex items-center justify-between">
									<span>{item.target_type} · {item.target_id}</span>
									<span className={`font-semibold ${item.ok ? 'text-emerald-600' : item.ok === false ? 'text-rose-600' : 'text-slate-500'}`}>
										{item.ok === null ? 'Pending' : item.ok ? 'OK' : 'Failed'}
									</span>
								</div>
								{item.error && <p className="mt-1 text-rose-600">{item.error}</p>}
							</li>
						))}
					</ul>
				</section>
			) : (
				<p className="text-xs text-slate-500">No per-target results yet.</p>
			)}
		</section>
	);
}
