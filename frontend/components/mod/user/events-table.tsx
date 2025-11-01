"use client";

import type { ReputationEvent } from "@/hooks/mod/user/use-reputation";

export type EventsTableProps = {
	events: ReputationEvent[];
	page: number;
	pageSize: number;
	total: number;
	loading?: boolean;
	error?: string | null;
	onPageChange?: (page: number) => void;
	onRetry?: () => void;
};

const SURFACE_LABELS: Record<string, string> = {
	comment: "Comment",
	post: "Post",
	message: "Message",
	report: "Report",
};

const KIND_LABELS: Record<string, string> = {
	strike: "Strike",
	restore: "Restore",
	appeal: "Appeal",
};

function resolveLabel(map: Record<string, string>, value: string) {
	return map[value] ?? value.replace(/_/g, " ");
}

export function EventsTable({ events, page, pageSize, total, loading, error, onPageChange, onRetry }: EventsTableProps) {
	const pageCount = Math.max(1, Math.ceil(total / pageSize));
	const canPrev = page > 1;
	const canNext = page < pageCount;

	return (
		<section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
			<div className="flex items-center justify-between gap-3">
				<div>
					<h3 className="text-base font-semibold text-slate-900">Recent reputation events</h3>
					<p className="text-sm text-slate-500">Showing {(page - 1) * pageSize + 1}–{Math.min(page * pageSize, total)} of {total}</p>
				</div>
				<div className="flex items-center gap-2">
					<button
						type="button"
						className="rounded-full border border-slate-200 px-3 py-1 text-xs font-semibold text-slate-700 disabled:opacity-50"
						onClick={() => canPrev && onPageChange?.(page - 1)}
						disabled={!canPrev}
						aria-label="Previous page"
					>
						Prev
					</button>
					<span className="text-xs text-slate-500">
						Page {page} of {pageCount}
					</span>
					<button
						type="button"
						className="rounded-full border border-slate-200 px-3 py-1 text-xs font-semibold text-slate-700 disabled:opacity-50"
						onClick={() => canNext && onPageChange?.(page + 1)}
						disabled={!canNext}
						aria-label="Next page"
					>
						Next
					</button>
				</div>
			</div>
			<div className="mt-4 overflow-x-auto">
				<table className="min-w-full divide-y divide-slate-200 text-left text-sm text-slate-700">
					<thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
						<tr>
							<th scope="col" className="px-3 py-2">
								Time
							</th>
							<th scope="col" className="px-3 py-2">
								Surface
							</th>
							<th scope="col" className="px-3 py-2">
								Kind
							</th>
							<th scope="col" className="px-3 py-2">
								Delta
							</th>
							<th scope="col" className="px-3 py-2">
								Summary
							</th>
						</tr>
					</thead>
					<tbody className="divide-y divide-slate-100">
						{loading ? (
							<tr>
								<td colSpan={5} className="px-3 py-8 text-center text-sm text-slate-500">
									Loading events…
								</td>
							</tr>
						) : events.length ? (
							events.map((event) => (
								<tr key={event.id}>
									<td className="px-3 py-2 text-xs text-slate-500">{new Date(event.occurred_at).toLocaleString()}</td>
									<td className="px-3 py-2">{resolveLabel(SURFACE_LABELS, event.surface)}</td>
									<td className="px-3 py-2 text-slate-600">{resolveLabel(KIND_LABELS, event.kind)}</td>
									<td className={`px-3 py-2 font-semibold ${event.delta >= 0 ? "text-emerald-600" : "text-rose-600"}`}>
										{event.delta >= 0 ? "+" : ""}
										{event.delta}
									</td>
									<td className="px-3 py-2">
										{event.summary ?? (event.meta ? JSON.stringify(event.meta) : "—")}
									</td>
								</tr>
							))) : (
							<tr>
								<td colSpan={5} className="px-3 py-8 text-center text-sm text-slate-500">
									No reputation events recorded.
								</td>
							</tr>
						)}
					</tbody>
				</table>
			</div>
			{error ? (
				<div className="mt-3 flex items-center justify-between rounded-2xl border border-rose-200 bg-rose-50 px-4 py-2 text-sm text-rose-700">
					<span>{error}</span>
					<button
						type="button"
						onClick={() => onRetry?.()}
						className="rounded-full border border-rose-300 px-3 py-1 text-xs font-semibold text-rose-700 hover:bg-rose-100"
					>
						Retry
					</button>
				</div>
			) : null}
		</section>
	);
}
