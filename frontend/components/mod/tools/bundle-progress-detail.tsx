"use client";

import type { ToolJobDetail } from "@/hooks/mod/tools/use-jobs";

export type BundleProgressDetailProps = {
	job: ToolJobDetail | null;
};

export function BundleProgressDetail({ job }: BundleProgressDetailProps) {
	if (!job) {
		return (
			<section className="rounded-3xl border border-dashed border-slate-200 p-6 text-sm text-slate-500">
				Select a job to see progress.
			</section>
		);
	}

	const progress = job.progress ?? {
		total: job.total ?? null,
		succeeded: job.succeeded ?? null,
		failed: job.failed ?? null,
	};

	return (
		<section className="space-y-4 rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
			<header className="space-y-1">
				<h2 className="text-lg font-semibold text-slate-900">Job {job.id}</h2>
				<p className="text-sm text-slate-600">
					{job.type} · {job.status}
				</p>
				<p className="text-xs text-slate-500">
					Started {job.started_at ?? "—"} · Finished {job.finished_at ?? "—"}
				</p>
			</header>

			<div className="grid gap-3 text-sm text-slate-700 sm:grid-cols-3">
				<span className="rounded-2xl border border-slate-200 bg-slate-50 px-3 py-3">Total: <strong>{progress.total ?? "—"}</strong></span>
				<span className="rounded-2xl border border-slate-200 bg-slate-50 px-3 py-3 text-emerald-700">Succeeded: <strong>{progress.succeeded ?? "—"}</strong></span>
				<span className="rounded-2xl border border-slate-200 bg-slate-50 px-3 py-3 text-rose-600">Failed: <strong>{progress.failed ?? "—"}</strong></span>
			</div>

			{job.ndjson_url ? (
				<a
					href={job.ndjson_url}
					target="_blank"
					rel="noreferrer"
					className="inline-flex items-center gap-2 rounded-full border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:border-slate-400"
				>
					Download NDJSON
				</a>
			) : null}

			{job.results && job.results.length > 0 ? (
				<div className="space-y-3">
					<h3 className="text-sm font-semibold text-slate-900">Results</h3>
					<ul className="divide-y divide-slate-200 overflow-hidden rounded-2xl border border-slate-200">
						{job.results.map((result) => (
							<li key={result.target} className="px-4 py-3 text-sm">
								<div className="flex flex-wrap items-center justify-between gap-2">
									<span className="font-medium text-slate-900">{result.target}</span>
									<span className={result.ok ? "text-emerald-600" : "text-rose-600"}>{result.ok ? "OK" : "Failed"}</span>
								</div>
								{result.message ? <p className="mt-1 text-xs text-slate-500">{result.message}</p> : null}
							</li>
						))}
					</ul>
				</div>
			) : (
				<p className="text-sm text-slate-500">No result rows yet.</p>
			)}
		</section>
	);
}
