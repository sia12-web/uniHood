"use client";

import { useCallback, useState } from 'react';

import type { HashRecord } from '@/hooks/mod/safety/use-hashes';

export type HashTableProps = {
	records: HashRecord[];
	total?: number | null;
	onLoadMore?: () => void;
	hasNextPage?: boolean;
	loadingMore?: boolean;
	onDelete?: (id: string) => Promise<void> | void;
	deletingId?: string | null;
};

export function HashTable({ records, total, onLoadMore, hasNextPage, loadingMore, onDelete, deletingId }: HashTableProps) {
	const [expanded, setExpanded] = useState<string | null>(null);
	const [copiedId, setCopiedId] = useState<string | null>(null);

	const handleCopy = useCallback(async (hash: string, id: string) => {
		try {
			await navigator.clipboard.writeText(hash);
			setCopiedId(id);
			setTimeout(() => setCopiedId((current) => (current === id ? null : current)), 1_500);
		} catch (error) {
			console.warn('Unable to copy hash', error);
		}
	}, []);

	const toggleExpanded = (id: string) => {
		setExpanded((current) => (current === id ? null : id));
	};

	return (
		<section className="space-y-4">
			<header className="flex items-center justify-between">
				<h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">Hash records</h2>
				{typeof total === 'number' && <span className="text-xs text-slate-400">{total.toLocaleString()} total</span>}
			</header>

			<div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
				<table className="min-w-full divide-y divide-slate-200 text-sm text-slate-600">
					<thead className="bg-slate-50">
						<tr>
							<th scope="col" className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">Algo</th>
							<th scope="col" className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">Hash</th>
							<th scope="col" className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">Label</th>
							<th scope="col" className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">Source</th>
							<th scope="col" className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">Created</th>
							<th scope="col" className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wide text-slate-500">Actions</th>
						</tr>
					</thead>
					<tbody className="divide-y divide-slate-100">
						{records.map((record) => {
							const shortHash = record.hash.length > 16 ? `${record.hash.slice(0, 12)}…${record.hash.slice(-4)}` : record.hash;
							const isExpanded = expanded === record.id;
							return (
								<tr key={record.id} className="align-top">
									<td className="px-4 py-3 font-semibold uppercase tracking-wide text-slate-500">{record.algo}</td>
									<td className="px-4 py-3">
										<span className="font-mono text-xs text-slate-800">{shortHash}</span>
									</td>
									<td className="px-4 py-3 text-xs text-slate-600">{record.label ?? '—'}</td>
									<td className="px-4 py-3 text-xs text-slate-600">{record.source ?? '—'}</td>
									<td className="px-4 py-3 text-xs text-slate-500">{new Date(record.created_at).toLocaleString()}</td>
									<td className="px-4 py-3 text-right text-xs">
										<div className="flex justify-end gap-2">
											<button
												type="button"
												onClick={() => handleCopy(record.hash, record.id)}
												className="rounded-full border border-slate-200 px-3 py-1 font-semibold text-slate-600 transition hover:bg-slate-100"
											>
												{copiedId === record.id ? 'Copied!' : 'Copy'}
											</button>
											<button
												type="button"
												onClick={() => toggleExpanded(record.id)}
												className="rounded-full border border-slate-200 px-3 py-1 font-semibold text-slate-600 transition hover:bg-slate-100"
												aria-expanded={isExpanded ? 'true' : 'false'}
											>
												{isExpanded ? 'Hide' : 'Details'}
											</button>
											{onDelete && (
												<button
													type="button"
													onClick={() => onDelete(record.id)}
													className="rounded-full border border-rose-200 bg-rose-50 px-3 py-1 font-semibold text-rose-700 transition hover:border-rose-300 hover:bg-rose-100 disabled:opacity-50"
													disabled={deletingId === record.id}
												>
													{deletingId === record.id ? 'Deleting…' : 'Delete'}
												</button>
											)}
										</div>
										{isExpanded && record.metadata && (
											<div className="mt-3 rounded-xl bg-slate-50 p-3 text-left text-xs text-slate-600">
												<pre className="max-h-48 overflow-y-auto whitespace-pre-wrap break-words">{JSON.stringify(record.metadata, null, 2)}</pre>
											</div>
										)}
									</td>
								</tr>
							);
						})}
					</tbody>
				</table>
			</div>

			{hasNextPage && onLoadMore && (
				<button
					type="button"
					onClick={onLoadMore}
					className="self-center rounded-full border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-600 shadow-sm transition hover:border-slate-400 hover:text-slate-900 disabled:opacity-50"
					disabled={loadingMore}
				>
					{loadingMore ? 'Loading…' : 'Load more'}
				</button>
			)}
		</section>
	);
}
