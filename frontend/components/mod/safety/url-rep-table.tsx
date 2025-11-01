"use client";

import { useState } from 'react';

import type { UrlScanRecord } from '@/hooks/mod/safety/use-url-rep';

export type UrlRepTableProps = {
	records: UrlScanRecord[];
	hasNextPage?: boolean;
	loadingMore?: boolean;
	onLoadMore?: () => void;
};

export function UrlRepTable({ records, hasNextPage, loadingMore, onLoadMore }: UrlRepTableProps) {
	const [expandedId, setExpandedId] = useState<string | null>(null);

	return (
		<section className="space-y-4">
			<header className="flex flex-col gap-1">
				<h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">URL reputation</h2>
				<p className="text-xs text-slate-500">Search by URL or eTLD to review verdict history and recent subjects.</p>
			</header>

			<div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
				<table className="min-w-full divide-y divide-slate-200 text-sm text-slate-600">
					<thead className="bg-slate-50">
						<tr>
							<th scope="col" className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">Final URL</th>
							<th scope="col" className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">eTLD+1</th>
							<th scope="col" className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">Verdict</th>
							<th scope="col" className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">Lists</th>
							<th scope="col" className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">First seen</th>
							<th scope="col" className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wide text-slate-500">Actions</th>
						</tr>
					</thead>
					<tbody className="divide-y divide-slate-100">
						{records.map((record) => {
							const isExpanded = expandedId === record.id;
							return (
								<tr key={record.id} className="align-top">
									<td className="px-4 py-3 text-xs text-indigo-600 underline-offset-2">
										<a href={record.final_url ?? record.url} target="_blank" rel="noreferrer" className="break-words font-mono">
											{record.final_url ?? record.url}
										</a>
									</td>
									<td className="px-4 py-3 text-xs text-slate-600">{record.etld1 ?? '—'}</td>
									<td className="px-4 py-3 text-xs font-semibold uppercase tracking-wide text-slate-600">{record.verdict}</td>
									<td className="px-4 py-3 text-xs text-slate-600">
										{record.lists?.length ? (
											<div className="flex flex-wrap gap-1">
												{record.lists.map((list) => (
													<span key={list} className="rounded-full bg-slate-100 px-2 py-1 text-[11px] font-semibold uppercase tracking-wide text-slate-600">
														{list}
													</span>
												))}
											</div>
										) : (
											<span>—</span>
										)}
									</td>
									<td className="px-4 py-3 text-xs text-slate-500">{new Date(record.first_seen).toLocaleString()}</td>
									<td className="px-4 py-3 text-right text-xs">
										<button
											type="button"
											onClick={() => setExpandedId(isExpanded ? null : record.id)}
											className="rounded-full border border-slate-200 px-3 py-1 font-semibold text-slate-600 transition hover:bg-slate-100"
											aria-expanded={isExpanded ? 'true' : 'false'}
										>
											{isExpanded ? 'Hide' : 'Details'}
										</button>
										{isExpanded && (
											<div className="mt-3 text-left text-xs text-slate-600">
												{record.redirect_chain?.length ? (
													<section className="space-y-1">
														<h4 className="font-semibold uppercase tracking-wide text-slate-500">Redirect chain</h4>
														<ol className="list-decimal space-y-1 pl-4">
															{record.redirect_chain.map((url) => (
																<li key={url} className="break-words font-mono">
																	{url}
																</li>
															))}
														</ol>
													</section>
												) : null}
												{record.subjects?.length ? (
													<section className="mt-3 space-y-1">
														<h4 className="font-semibold uppercase tracking-wide text-slate-500">Recent subjects</h4>
														<ul className="space-y-1">
															{record.subjects.slice(0, 10).map((subject) => (
																<li key={subject.id} className="break-words">
																	{subject.type} · {subject.id}
																	{subject.title ? ` — ${subject.title}` : ''}
																</li>
															))}
														</ul>
													</section>
												) : null}
												{record.last_seen && (
													<p className="mt-3 text-xs text-slate-500">Last seen {new Date(record.last_seen).toLocaleString()}</p>
												)}
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
