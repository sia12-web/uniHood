"use client";

import type { LinkageResponse } from "@/hooks/mod/linkage/use-linkage";

export type LinkageTableProps = {
	data?: LinkageResponse;
	selected?: string[];
	onToggleSelect?: (userId: string) => void;
	onOpenUser?: (userId: string) => void;
	canSelect?: boolean;
};

export function LinkageTable({ data, selected, onToggleSelect, onOpenUser, canSelect }: LinkageTableProps) {
	const peers = data?.peers ?? [];
	const selection = new Set(selected ?? []);

	return (
		<div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
			<div className="flex items-center justify-between">
				<h3 className="text-base font-semibold text-slate-900">Linked accounts</h3>
				<p className="text-xs text-slate-500">{peers.length} peers</p>
			</div>
			<div className="mt-4 overflow-x-auto">
				<table className="min-w-full divide-y divide-slate-200 text-left text-sm text-slate-700">
					<thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
						<tr>
							{canSelect ? <th className="px-2 py-2">Select</th> : null}
							<th className="px-3 py-2">User</th>
							<th className="px-3 py-2">Relations</th>
							<th className="px-3 py-2">Campus</th>
							<th className="px-3 py-2">Last seen</th>
							<th className="px-3 py-2 text-right">Actions</th>
						</tr>
					</thead>
					<tbody className="divide-y divide-slate-100">
						{peers.length ? (
							peers.map((peer) => (
								<tr key={peer.user_id}>
									{canSelect ? (
										<td className="px-2 py-2">
											<input
												type="checkbox"
												checked={selection.has(peer.user_id)}
												onChange={() => onToggleSelect?.(peer.user_id)}
												aria-label={`Select ${peer.display_name ?? peer.user_id}`}
											/>
										</td>
									) : null}
									<td className="px-3 py-2">
										<div className="flex flex-col">
											<span className="font-semibold text-slate-800">{peer.display_name ?? peer.user_id}</span>
											<span className="text-xs text-slate-500">{peer.user_id}</span>
										</div>
									</td>
									<td className="px-3 py-2 text-xs text-slate-600">
										{peer.relations.map((relation) => (
											<span key={relation.relation} className="mr-2 inline-flex items-center gap-1 rounded-full bg-slate-100 px-2 py-0.5">
												{relation.relation}
												<span className="font-semibold text-slate-700">{relation.strength}</span>
											</span>
										))}
									</td>
									<td className="px-3 py-2 text-slate-600">{peer.campus ?? "—"}</td>
									<td className="px-3 py-2 text-slate-500">
										{peer.last_seen_at ? new Date(peer.last_seen_at).toLocaleString() : "—"}
									</td>
									<td className="px-3 py-2 text-right">
										<button
											type="button"
											onClick={() => onOpenUser?.(peer.user_id)}
											className="rounded-full border border-slate-200 px-3 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-100"
										>
											Open profile
										</button>
									</td>
								</tr>
							))
						) : (
							<tr>
								<td colSpan={canSelect ? 6 : 5} className="px-3 py-8 text-center text-sm text-slate-500">
									No linkage data available.
								</td>
							</tr>
						)}
					</tbody>
				</table>
			</div>
		</div>
	);
}
