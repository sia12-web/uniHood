"use client";

import { FormEvent, useMemo, useState } from 'react';

import { UrlRepTable } from '@/components/mod/safety/url-rep-table';
import { useUrlReputation, type UrlRepFilters } from '@/hooks/mod/safety/use-url-rep';

export default function SafetyUrlsPage() {
	const [draft, setDraft] = useState({ query: '', etld1: '', verdict: '' });
	const [filters, setFilters] = useState<UrlRepFilters>({});

	const query = useUrlReputation(filters);
	const records = useMemo(() => query.data?.pages.flatMap((page) => page.items) ?? [], [query.data?.pages]);

	const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
		event.preventDefault();
		setFilters({
			query: draft.query.trim() || undefined,
			etld1: draft.etld1.trim() || undefined,
			verdict: draft.verdict.trim() || undefined,
		});
	};

	const handleReset = () => {
		setDraft({ query: '', etld1: '', verdict: '' });
		setFilters({});
	};

	const error = query.error ? (query.error instanceof Error ? query.error.message : 'Unable to load URL reputation') : null;

	return (
		<div className="space-y-6">
			<header className="flex flex-col gap-2">
				<h1 className="text-2xl font-semibold text-slate-900">URL reputation</h1>
				<p className="text-sm text-slate-600">Investigate URLs and domains captured by scanning pipelines.</p>
			</header>

			<form onSubmit={handleSubmit} className="grid gap-4 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm md:grid-cols-4">
				<label className="flex flex-col gap-1 text-xs font-semibold uppercase tracking-wide text-slate-500 md:col-span-2">
					URL or query
					<input
						type="text"
						value={draft.query}
						onChange={(event) => setDraft((prev) => ({ ...prev, query: event.target.value }))}
						className="rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-slate-400 focus:outline-none"
						placeholder="https://example.com/path"
					/>
				</label>
				<label className="flex flex-col gap-1 text-xs font-semibold uppercase tracking-wide text-slate-500">
					eTLD+1
					<input
						type="text"
						value={draft.etld1}
						onChange={(event) => setDraft((prev) => ({ ...prev, etld1: event.target.value }))}
						className="rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-slate-400 focus:outline-none"
						placeholder="example.com"
					/>
				</label>
				<label className="flex flex-col gap-1 text-xs font-semibold uppercase tracking-wide text-slate-500">
					Verdict
					<input
						type="text"
						value={draft.verdict}
						onChange={(event) => setDraft((prev) => ({ ...prev, verdict: event.target.value }))}
						className="rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-slate-400 focus:outline-none"
						placeholder="blocked"
					/>
				</label>
				<div className="flex items-end gap-2">
					<button
						type="submit"
						className="rounded-full border border-slate-900 bg-slate-900 px-4 py-2 text-sm font-semibold text-white transition hover:bg-slate-800"
					>
						Search
					</button>
					<button
						type="button"
						onClick={handleReset}
						className="rounded-full border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-600 transition hover:bg-slate-100"
					>
						Reset
					</button>
				</div>
			</form>

			{error && <p className="text-sm text-rose-600">{error}</p>}

			<UrlRepTable
				records={records}
				hasNextPage={query.hasNextPage}
				loadingMore={query.isFetchingNextPage}
				onLoadMore={() => query.fetchNextPage()}
			/>
		</div>
	);
}
