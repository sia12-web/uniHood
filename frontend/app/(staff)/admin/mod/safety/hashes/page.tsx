"use client";

import Link from 'next/link';
import { FormEvent, useMemo, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';

import { HashTable } from '@/components/mod/safety/hash-table';
import { useHashRecords, type HashFilters } from '@/hooks/mod/safety/use-hashes';
import { modApi } from '@/lib/api-mod';

export default function SafetyHashesPage() {
	const [draft, setDraft] = useState({ search: '', algo: '', label: '', source: '' });
	const [filters, setFilters] = useState<HashFilters>({});
	const qc = useQueryClient();

	const query = useHashRecords(filters);
	const records = useMemo(() => query.data?.pages.flatMap((page) => page.items) ?? [], [query.data?.pages]);
	const total = query.data?.pages[0]?.total ?? null;

	const deleteMutation = useMutation({
		mutationFn: async (id: string) => {
			await modApi.delete(`/hashes/${id}`);
		},
		onSuccess: () => {
			qc.invalidateQueries({ queryKey: ['mod:hashes'] });
		},
	});

	const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
		event.preventDefault();
		setFilters({
			search: draft.search.trim() || undefined,
			algo: draft.algo.trim() || undefined,
			label: draft.label.trim() || undefined,
			source: draft.source.trim() || undefined,
		});
	};

	const handleReset = () => {
		setDraft({ search: '', algo: '', label: '', source: '' });
		setFilters({});
	};

	const deletingId = deleteMutation.variables ?? null;
	const deleteError = deleteMutation.error ? (deleteMutation.error instanceof Error ? deleteMutation.error.message : 'Unable to delete hash') : null;

	return (
		<div className="space-y-6">
			<header className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
				<div>
					<h1 className="text-2xl font-semibold text-slate-900">Perceptual hash lists</h1>
					<p className="text-sm text-slate-600">Search, review, and manage hash list entries across supported algorithms.</p>
				</div>
				<Link
					href="/admin/mod/safety/hashes/import"
					className="inline-flex items-center justify-center rounded-full border border-slate-900 bg-slate-900 px-4 py-2 text-sm font-semibold text-white transition hover:bg-slate-800"
				>
					Import hash file
				</Link>
			</header>

			<form onSubmit={handleSubmit} className="grid gap-4 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm md:grid-cols-5">
				<label className="flex flex-col gap-1 text-xs font-semibold uppercase tracking-wide text-slate-500 md:col-span-2">
					Search hash
					<input
						type="text"
						value={draft.search}
						onChange={(event) => setDraft((prev) => ({ ...prev, search: event.target.value }))}
						className="rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-slate-400 focus:outline-none"
						placeholder="Hash prefix"
					/>
				</label>
				<label className="flex flex-col gap-1 text-xs font-semibold uppercase tracking-wide text-slate-500">
					Algorithm
					<input
						type="text"
						value={draft.algo}
						onChange={(event) => setDraft((prev) => ({ ...prev, algo: event.target.value }))}
						className="rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-slate-400 focus:outline-none"
						placeholder="pdq"
					/>
				</label>
				<label className="flex flex-col gap-1 text-xs font-semibold uppercase tracking-wide text-slate-500">
					Label
					<input
						type="text"
						value={draft.label}
						onChange={(event) => setDraft((prev) => ({ ...prev, label: event.target.value }))}
						className="rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-slate-400 focus:outline-none"
						placeholder="eg. csam"
					/>
				</label>
				<label className="flex flex-col gap-1 text-xs font-semibold uppercase tracking-wide text-slate-500">
					Source
					<input
						type="text"
						value={draft.source}
						onChange={(event) => setDraft((prev) => ({ ...prev, source: event.target.value }))}
						className="rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-slate-400 focus:outline-none"
						placeholder="Partner"
					/>
				</label>
				<div className="flex items-end gap-2">
					<button
						type="submit"
						className="rounded-full border border-slate-900 bg-slate-900 px-4 py-2 text-sm font-semibold text-white transition hover:bg-slate-800"
					>
						Apply filters
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

			{deleteError && <p className="text-sm text-rose-600">{deleteError}</p>}

			<HashTable
				records={records}
				total={total}
				onLoadMore={() => query.fetchNextPage()}
				hasNextPage={query.hasNextPage}
				loadingMore={query.isFetchingNextPage}
				onDelete={(id) => deleteMutation.mutateAsync(id)}
				deletingId={typeof deletingId === 'string' ? deletingId : null}
			/>
		</div>
	);
}
